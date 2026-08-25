import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { GlobalWorkerOptions, getDocument, TextLayer, type PDFDocumentProxy, type PDFPageProxy } from 'pdfjs-dist'
import type { TextContent } from 'pdfjs-dist/types/src/display/api'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { Alert } from '../components/Alert'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { EmptyRow } from '../components/EmptyRow'
import { Input } from '../components/Input'
import { StatusBadge } from '../components/StatusBadge'
import { AppLink } from '../routes/AppLink'
import { buildAgentPrompt } from '../domain/agent-prompts'
import { AgentGatewayError, createAgentGateway, type AgentRun } from '../domain/agent-gateway'
import { providerClient, type ProviderStatus } from '../domain/providers'
import { createPdfObjectGraph, createPdfPage, layoutPdfJsTextLayer, normalizedSelectionRects, PdfTextLayerLifecycle, pdfTextLayerItemIds, selectionAnchorFromDom, surroundingBlockContext, type PdfTextSource } from '../domain/pdf'
import { createReaderHighlight, listReaderHighlights, PdfLoadLifecycle, removeReaderHighlight, type ReaderHighlight } from '../domain/reader'
import { documentFilePath } from '../domain/library'
import type { Page, PdfObjectGraph, SelectionAnchor } from '../domain/types'

GlobalWorkerOptions.workerSrc = workerUrl

type ReaderPageProps = {
  documentId: string
  onBackToLibrary: () => void
  onOpenSettings: () => void
}

type ReaderPanel = 'info' | 'chat' | 'highlights'
type AgentTask = 'explain' | 'translate'
type AgentUiState = 'idle' | 'checking-provider' | 'running' | 'completed' | 'cancelled' | 'error'

const READER_PANELS: readonly ReaderPanel[] = ['info', 'chat', 'highlights']

class ReaderLoadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ReaderLoadError'
  }
}

type PdfJsTextItem = {
  str: string
  transform: number[]
  width: number
  height: number
  fontName: string
  dir: 'ltr' | 'rtl' | 'ttb'
}

type PdfJsTextStyle = {
  ascent?: number
  descent?: number
  vertical?: boolean
}

type PdfViewport = {
  width: number
  height: number
  scale: number
  rotation: number
  transform: number[]
}

function isTextItem(value: unknown): value is PdfJsTextItem {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return typeof item.str === 'string' && Array.isArray(item.transform) && typeof item.width === 'number'
    && typeof item.height === 'number' && typeof item.fontName === 'string'
    && (item.dir === 'ltr' || item.dir === 'rtl' || item.dir === 'ttb')
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function textSourcesForPage(viewport: PdfViewport & { rawDims: object }, items: readonly unknown[], styles: Record<string, PdfJsTextStyle> = {}): PdfTextSource[] {
  const rawDims = viewport.rawDims as { pageWidth: number; pageHeight: number; pageX: number; pageY: number }
  return items.flatMap((item, index) => {
    if (!isTextItem(item) || !item.str.trim()) return []
    const style = styles[item.fontName]
    const layout = layoutPdfJsTextLayer({
      width: viewport.width,
      height: viewport.height,
      scale: viewport.scale,
      rotation: viewport.rotation,
      rawWidth: rawDims.pageWidth,
      rawHeight: rawDims.pageHeight,
      rawX: rawDims.pageX,
      rawY: rawDims.pageY,
    }, item.transform, style?.vertical ? item.height : item.width, style)
    return [{
      text: item.str,
      bounds: layout.bounds,
      direction: item.dir,
      fontName: item.fontName,
      fontSize: layout.fontHeight / viewport.height,
      sourceOrder: index,
    }]
  })
}

function textLayerRotationTransform(rotation: number): string {
  switch ((rotation % 360 + 360) % 360) {
    case 90: return 'rotate(90deg) translateY(-100%)'
    case 180: return 'rotate(180deg) translate(-100%, -100%)'
    case 270: return 'rotate(270deg) translateX(-100%)'
    default: return 'none'
  }
}

function configurePdfJsTextLayer(container: HTMLDivElement, viewport: PdfViewport & { rawDims: object }) {
  // These are the minimal TextLayer stylesheet rules from pdf.js. Keeping them
  // local avoids importing the full PDF viewer stylesheet into PaperBridge.
  const rawDims = viewport.rawDims as { pageWidth: number; pageHeight: number }
  container.style.width = `${rawDims.pageWidth * viewport.scale}px`
  container.style.height = `${rawDims.pageHeight * viewport.scale}px`
  container.style.transform = textLayerRotationTransform(viewport.rotation)
  container.style.transformOrigin = '0 0'
  container.style.setProperty('--total-scale-factor', String(viewport.scale))
  container.style.setProperty('--text-scale-factor', 'calc(var(--total-scale-factor) * var(--min-font-size))')
  container.style.setProperty('--min-font-size-inv', 'calc(1 / var(--min-font-size))')
}

function decoratePdfJsTextDiv(div: HTMLElement, textItemId: string) {
  div.classList.add('pdf-text-item')
  div.dataset.textItemId = textItemId
  div.style.fontSize = 'calc(var(--text-scale-factor) * var(--font-height))'
  div.style.transform = 'rotate(var(--rotate, 0deg)) scaleX(var(--scale-x, 1)) scale(var(--min-font-size-inv, 1))'
  div.style.userSelect = 'text'
}

function textSourcesFromRenderedLayer(
  pageElement: HTMLElement,
  textContent: TextContent,
  textDivs: readonly HTMLElement[],
): PdfTextSource[] {
  const textRuns = textContent.items.flatMap((item, sourceOrder) => isTextItem(item) ? [{ item, sourceOrder }] : [])
  const pageRect = pageElement.getBoundingClientRect()
  if (pageRect.width <= 0 || pageRect.height <= 0) return []

  return textRuns.flatMap(({ item, sourceOrder }, textIndex) => {
    const div = textDivs[textIndex]
    if (!div || !item.str.trim()) return []
    const bounds = normalizedSelectionRects(pageRect, [div.getBoundingClientRect()])[0]
    if (!bounds) return []
    return [{
      text: item.str,
      bounds,
      direction: item.dir,
      fontName: item.fontName,
      fontSize: Math.min(bounds.width, bounds.height),
      sourceOrder,
    }]
  })
}

function formatDate(timestamp: string): string {
  const date = new Date(timestamp)
  return Number.isNaN(date.getTime()) ? '시간 정보 없음' : new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function closestReaderSurface(node: Node): HTMLElement | null {
  const element = node.nodeType === Node.ELEMENT_NODE ? node as HTMLElement : node.parentElement
  return element?.closest<HTMLElement>('[data-reader-page-number]') ?? null
}

function sameAnchor(left: SelectionAnchor | null, right: SelectionAnchor): boolean {
  return left?.documentId === right.documentId
    && left.pageNumber === right.pageNumber
    && left.selectedText === right.selectedText
    && JSON.stringify(left.rects) === JSON.stringify(right.rects)
    && JSON.stringify(left.textRange) === JSON.stringify(right.textRange)
}

function PageCanvas({
  pdfDocument,
  pageNumber,
  zoom,
  highlights,
  isKeyboardFocusable,
  onTextLayerSources,
}: {
  pdfDocument: PDFDocumentProxy
  pageNumber: number
  zoom: number
  highlights: readonly ReaderHighlight[]
  isKeyboardFocusable: boolean
  onTextLayerSources: (pageNumber: number, viewport: PdfViewport, text: PdfTextSource[]) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const surfaceRef = useRef<HTMLDivElement>(null)
  const textLayerRef = useRef<HTMLDivElement>(null)
  const [page, setPage] = useState<PDFPageProxy | null>(null)
  const [hasTextLayer, setHasTextLayer] = useState<boolean | null>(null)
  const [pageSize, setPageSize] = useState({ width: 0, height: 0 })
  const [renderError, setRenderError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void pdfDocument.getPage(pageNumber).then((resolvedPage) => {
      if (active) setPage(resolvedPage)
    }).catch(() => {
      if (active) setRenderError(`${pageNumber}쪽을 불러오지 못했습니다.`)
    })
    return () => { active = false }
  }, [pageNumber, pdfDocument])

  useEffect(() => {
    if (!page || !canvasRef.current || !surfaceRef.current || !textLayerRef.current) return
    let active = true
    let renderTask: ReturnType<PDFPageProxy['render']> | null = null
    let textLayer: TextLayer | null = null
    const textLayerLifecycle = new PdfTextLayerLifecycle()
    let layoutFrame: number | null = null
    const canvas = canvasRef.current
    const surface = surfaceRef.current
    const textLayerContainer = textLayerRef.current
    textLayerContainer.replaceChildren()
    const render = async () => {
      try {
        const viewport = page.getViewport({ scale: zoom })
        const textLayerViewport = viewport as unknown as PdfViewport & { rawDims: object }
        const devicePixelRatio = window.devicePixelRatio || 1
        surface.style.width = `${viewport.width}px`
        surface.style.height = `${viewport.height}px`
        setPageSize({ width: viewport.width, height: viewport.height })
        canvas.width = Math.floor(viewport.width * devicePixelRatio)
        canvas.height = Math.floor(viewport.height * devicePixelRatio)
        canvas.style.width = `${viewport.width}px`
        canvas.style.height = `${viewport.height}px`
        const context = canvas.getContext('2d', { alpha: false })
        if (!context) throw new Error('PDF 화면을 표시할 수 없습니다.')
        renderTask = page.render({ canvas, canvasContext: context, viewport, transform: [devicePixelRatio, 0, 0, devicePixelRatio, 0, 0] })
        await renderTask.promise
        const textContent = await page.getTextContent()
        if (!active) return
        setHasTextLayer(textContent.items.some((item) => isTextItem(item) && item.str.trim().length > 0))
        textLayer = new TextLayer({ textContentSource: textContent, container: textLayerContainer, viewport })
        if (!textLayerLifecycle.attach(textLayer)) return
        configurePdfJsTextLayer(textLayerContainer, textLayerViewport)
        await textLayer.render()
        if (!active) return
        const itemIds = pdfTextLayerItemIds(pageNumber, textContent.items)
        textLayer.textDivs.forEach((div, index) => {
          const textItemId = itemIds[index]
          if (textItemId) decoratePdfJsTextDiv(div, textItemId)
        })
        layoutFrame = window.requestAnimationFrame(() => {
          if (!active) return
          const text = textSourcesFromRenderedLayer(surface, textContent, textLayer?.textDivs ?? [])
          if (text.length > 0) onTextLayerSources(pageNumber, viewport, text)
        })
      } catch {
        if (active) setRenderError(`${pageNumber}쪽을 표시하지 못했습니다.`)
      }
    }
    void render()
    return () => {
      active = false
      if (layoutFrame !== null) window.cancelAnimationFrame(layoutFrame)
      textLayerLifecycle.cancel()
      textLayerContainer.replaceChildren()
      renderTask?.cancel()
    }
  }, [onTextLayerSources, page, pageNumber, zoom])

  const pageHighlights = highlights.filter((highlight) => highlight.anchor.pageNumber === pageNumber)
  return (
    <article className="pdf-page" aria-label={`PDF ${pageNumber}쪽`}>
      <div className="pdf-page-label">{pageNumber}쪽</div>
      {renderError ? <Alert tone="error">{renderError}</Alert> : null}
      <div ref={surfaceRef} className="pdf-page-surface" data-reader-page-number={pageNumber} style={{ width: pageSize.width || undefined, height: pageSize.height || undefined }}>
        <canvas ref={canvasRef} className="pdf-canvas" aria-label={`표시된 PDF ${pageNumber}쪽`} />
        <div className="pdf-highlight-layer" aria-hidden="true">
          {pageHighlights.flatMap((highlight) => highlight.anchor.rects.map((rect, index) => (
            <span
              className="pdf-highlight"
              key={`${highlight.id}-${index}`}
              style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%` }}
            />
          )))}
        </div>
        <div ref={textLayerRef} className="pdf-text-layer" role="document" tabIndex={isKeyboardFocusable ? 0 : -1} aria-label={`선택 가능한 PDF ${pageNumber}쪽 텍스트. 텍스트를 선택하면 다음 작업을 사용할 수 있습니다.`} />
      </div>
      {page && hasTextLayer === false ? <Alert tone="warning">텍스트 레이어 없음: 스캔 이미지로 보이는 쪽입니다. 원문은 읽을 수 있지만 텍스트 선택은 지원하지 않습니다.</Alert> : null}
    </article>
  )
}

export function ReaderPage({ documentId, onBackToLibrary, onOpenSettings }: ReaderPageProps) {
  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null)
  const [graph, setGraph] = useState<PdfObjectGraph | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [showAllPages, setShowAllPages] = useState(false)
  const [zoom, setZoom] = useState(1.2)
  const [selectedAnchor, setSelectedAnchor] = useState<SelectionAnchor | null>(null)
  const [highlights, setHighlights] = useState<ReaderHighlight[]>([])
  const [highlightError, setHighlightError] = useState<string | null>(null)
  const [isSavingHighlight, setIsSavingHighlight] = useState(false)
  const [panel, setPanel] = useState<ReaderPanel>('info')
  const [agentState, setAgentState] = useState<AgentUiState>('idle')
  const [agentTask, setAgentTask] = useState<AgentTask | null>(null)
  const [agentText, setAgentText] = useState('')
  const [agentError, setAgentError] = useState<string | null>(null)
  const [providerStatus, setProviderStatus] = useState<ProviderStatus | null>(null)
  const viewerRef = useRef<HTMLDivElement>(null)
  const pointerSelectingRef = useRef(false)
  const agentRunRef = useRef<AgentRun | null>(null)
  const agentControllerRef = useRef<AbortController | null>(null)
  const agentCancelRequestedRef = useRef(false)

  const finalizeReaderSelection = useCallback(() => {
    const viewer = viewerRef.current
    const selection = window.getSelection()
    if (!viewer || !selection) return
    if (selection.rangeCount === 0 || selection.isCollapsed) {
      if (selection.anchorNode && viewer.contains(selection.anchorNode)) setSelectedAnchor(null)
      return
    }
    const range = selection.getRangeAt(0)
    const startSurface = closestReaderSurface(range.startContainer)
    const endSurface = closestReaderSurface(range.endContainer)
    const touchesReader = Boolean((startSurface && viewer.contains(startSurface)) || (endSurface && viewer.contains(endSurface)))
    if (!startSurface || startSurface !== endSurface || !viewer.contains(startSurface)) {
      if (touchesReader) setSelectedAnchor(null)
      return
    }
    const pageNumber = Number(startSurface.dataset.readerPageNumber)
    if (!Number.isInteger(pageNumber) || pageNumber < 1) return
    const anchor = selectionAnchorFromDom(documentId, pageNumber, startSurface, selection)
    if (!anchor?.selectedText) return
    setSelectedAnchor((current) => sameAnchor(current, anchor) ? current : anchor)
  }, [documentId])

  const dismissSelection = useCallback(() => {
    const selectedPage = selectedAnchor?.pageNumber
    window.getSelection()?.removeAllRanges()
    setSelectedAnchor(null)
    if (!selectedPage) return
    window.requestAnimationFrame(() => {
      viewerRef.current?.querySelector<HTMLElement>(`[data-reader-page-number="${selectedPage}"] .pdf-text-layer`)?.focus()
    })
  }, [selectedAnchor])

  useEffect(() => {
    const lifecycle = new PdfLoadLifecycle()
    const controller = new AbortController()
    const load = async () => {
      try {
        const response = await fetch(documentFilePath(documentId), {
          signal: controller.signal,
          credentials: 'same-origin',
          headers: { accept: 'application/pdf' },
        })
        if (!response.ok) {
          if (response.status === 404) throw new ReaderLoadError('이 문서는 현재 비공개 보관함 세션에 없습니다. 보관함으로 돌아가 열 수 있는 문서를 선택하세요.')
          throw new ReaderLoadError('PaperBridge가 이 비공개 PDF를 열지 못했습니다. 접근 권한을 확인한 뒤 보관함에서 다시 시도하세요.')
        }
        const bytes = new Uint8Array(await response.arrayBuffer())
        if (!lifecycle.isActive) return
        const task = getDocument({ data: bytes })
        if (!lifecycle.attach(task)) return
        const loaded = await task.promise
        if (!lifecycle.isActive) return
        const pages: Page[] = []
        for (let pageNumber = 1; pageNumber <= loaded.numPages; pageNumber += 1) {
          if (!lifecycle.isActive) return
          const page = await loaded.getPage(pageNumber)
          if (!lifecycle.isActive) return
          const viewport = page.getViewport({ scale: 1 })
          const textContent = await page.getTextContent()
          if (!lifecycle.isActive) return
          pages.push(createPdfPage({
            pageNumber,
            width: viewport.width,
            height: viewport.height,
            rotation: viewport.rotation as Page['rotation'],
            text: textSourcesForPage(viewport, textContent.items, textContent.styles),
          }))
        }
        if (!lifecycle.isActive) return
        setPdfDocument(loaded)
        setGraph(createPdfObjectGraph(documentId, pages, new Date().toISOString()))
      } catch (error) {
        if (lifecycle.isActive && (error as DOMException).name !== 'AbortError') {
          setLoadError(error instanceof ReaderLoadError
            ? error.message
            : 'PaperBridge가 이 PDF를 불러오지 못했습니다. 파일을 확인한 뒤 보관함에서 다시 시도하세요.')
        }
      } finally {
        if (lifecycle.isActive) setLoading(false)
      }
    }
    void load()
    return () => {
      controller.abort()
      lifecycle.dispose()
    }
  }, [documentId])

  useEffect(() => {
    const onSelectionChange = () => {
      if (!pointerSelectingRef.current) finalizeReaderSelection()
    }
    const onPointerUp = () => { pointerSelectingRef.current = false }
    document.addEventListener('selectionchange', onSelectionChange)
    window.addEventListener('pointerup', onPointerUp)
    return () => {
      document.removeEventListener('selectionchange', onSelectionChange)
      window.removeEventListener('pointerup', onPointerUp)
    }
  }, [finalizeReaderSelection])

  useEffect(() => {
    const controller = new AbortController()
    void listReaderHighlights(documentId, controller.signal).then((items) => {
      setHighlights(items)
    }).catch((error: unknown) => {
      if ((error as DOMException).name !== 'AbortError') setHighlightError('하이라이트를 불러오지 못했습니다.')
    })
    return () => controller.abort()
  }, [documentId])

  const pageCount = pdfDocument?.numPages ?? 0
  const visiblePages = useMemo(() => {
    if (!pdfDocument) return []
    return showAllPages ? Array.from({ length: pageCount }, (_, index) => index + 1) : [currentPage]
  }, [currentPage, pageCount, pdfDocument, showAllPages])
  const scannedPageCount = graph?.pages.filter((page) => page.textItems.length === 0).length ?? 0
  const selectionContext = selectedAnchor && graph ? surroundingBlockContext(graph, selectedAnchor) : ''

  const cancelAgent = useCallback(() => {
    if (agentState !== 'checking-provider' && agentState !== 'running') return
    agentCancelRequestedRef.current = true
    agentRunRef.current?.cancel()
    agentControllerRef.current?.abort()
    setAgentState('cancelled')
  }, [agentState])

  const runSelectionTask = useCallback(async (task: AgentTask) => {
    if (!selectedAnchor || !graph || agentState === 'checking-provider' || agentState === 'running') return

    const controller = new AbortController()
    agentControllerRef.current?.abort()
    agentRunRef.current = null
    agentControllerRef.current = controller
    agentCancelRequestedRef.current = false
    setAgentTask(task)
    setAgentText('')
    setAgentError(null)
    setPanel('chat')
    setAgentState('checking-provider')

    try {
      let runFailed = false
      let currentProviderStatus = providerStatus
      if (!currentProviderStatus) {
        currentProviderStatus = await providerClient.getStatus(controller.signal)
        if (!controller.signal.aborted) setProviderStatus(currentProviderStatus)
      }
      if (controller.signal.aborted || agentCancelRequestedRef.current) return
      if (!currentProviderStatus.openRouter.configured) {
        setAgentError('OpenRouter가 연결되지 않았습니다. 설정에서 API 키와 모델 ID를 저장한 뒤 다시 실행하세요.')
        setAgentState('error')
        return
      }

      const prompt = buildAgentPrompt({
        graph,
        taskType: task,
        scope: 'selection',
        selection: selectedAnchor,
      })
      setAgentState('running')
      const run = await createAgentGateway().start({
        providerId: 'openrouter',
        documentId,
        taskType: task,
        prompt: prompt.userPrompt,
        context: prompt.context,
        signal: controller.signal,
      })
      agentRunRef.current = run
      if (controller.signal.aborted || agentCancelRequestedRef.current) {
        run.cancel()
        return
      }

      for await (const event of run.events) {
        if (agentCancelRequestedRef.current || controller.signal.aborted) break
        if (event.type === 'text-delta') {
          setAgentText((current) => current + event.delta)
        } else if (event.type === 'result') {
          setAgentText(event.text)
        } else if (event.type === 'error') {
          runFailed = true
          setAgentError(event.error.message)
          setAgentState('error')
        } else if (event.type === 'done') {
          if (event.outcome === 'completed' && !runFailed) setAgentState('completed')
          else if (event.outcome === 'cancelled') setAgentState('cancelled')
          else {
            if (!runFailed) setAgentError('AI 실행을 완료하지 못했습니다. 잠시 후 다시 시도하세요.')
            setAgentState('error')
          }
        }
      }
    } catch (error) {
      if (controller.signal.aborted || agentCancelRequestedRef.current) return
      const message = error instanceof AgentGatewayError
        ? error.message
        : '선택한 텍스트 작업을 완료하지 못했습니다. 텍스트를 다시 선택한 뒤 재시도하세요.'
      setAgentError(message)
      setAgentState('error')
    } finally {
      if (agentControllerRef.current === controller) {
        agentControllerRef.current = null
        agentRunRef.current = null
      }
    }
  }, [agentState, documentId, graph, providerStatus, selectedAnchor])

  useEffect(() => () => {
    agentCancelRequestedRef.current = true
    agentRunRef.current?.cancel()
    agentControllerRef.current?.abort()
  }, [documentId])

  const updatePageTextSources = useCallback((pageNumber: number, viewport: PdfViewport, text: PdfTextSource[]) => {
    setGraph((current) => {
      if (!current || !current.pages.some((page) => page.pageNumber === pageNumber)) return current
      const updatedPage = createPdfPage({
        pageNumber,
        width: viewport.width,
        height: viewport.height,
        rotation: viewport.rotation as Page['rotation'],
        text,
      })
      return {
        ...current,
        pages: current.pages.map((page) => page.pageNumber === pageNumber ? updatedPage : page),
      }
    })
  }, [])

  const moveToPage = (page: number) => {
    setShowAllPages(false)
    setCurrentPage(clamp(page, 1, Math.max(1, pageCount)))
  }

  const saveHighlight = async () => {
    if (!selectedAnchor || isSavingHighlight) return
    setIsSavingHighlight(true)
    setHighlightError(null)
    try {
      const saved = await createReaderHighlight(documentId, {
        anchor: selectedAnchor,
        selectedText: selectedAnchor.selectedText ?? '',
        context: selectionContext,
      })
      setHighlights((current) => [saved, ...current.filter((item) => item.id !== saved.id)])
      setSelectedAnchor(null)
      window.getSelection()?.removeAllRanges()
      setPanel('highlights')
    } catch {
      setHighlightError('하이라이트를 저장하지 못했습니다.')
    } finally {
      setIsSavingHighlight(false)
    }
  }

  const deleteHighlight = async (highlight: ReaderHighlight) => {
    setHighlightError(null)
    try {
      await removeReaderHighlight(documentId, highlight.id)
      setHighlights((current) => current.filter((item) => item.id !== highlight.id))
    } catch {
      setHighlightError('하이라이트를 삭제하지 못했습니다.')
    }
  }

  const moveToHighlight = (highlight: ReaderHighlight) => {
    moveToPage(highlight.anchor.pageNumber)
    window.setTimeout(() => document.getElementById(`reader-page-${highlight.anchor.pageNumber}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 0)
  }

  const handleReaderKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Escape' || !selectedAnchor) return
    event.preventDefault()
    dismissSelection()
  }

  const handleReaderKeyUp = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const isSelectionKey = event.shiftKey || event.key === 'Shift'
      || ['ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'End', 'Home'].includes(event.key)
      || ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a')
    if (isSelectionKey) window.setTimeout(finalizeReaderSelection, 0)
  }

  const handlePanelTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, tab: ReaderPanel) => {
    const currentIndex = READER_PANELS.indexOf(tab)
    let nextIndex: number | null = null
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % READER_PANELS.length
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + READER_PANELS.length) % READER_PANELS.length
    else if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = READER_PANELS.length - 1
    if (nextIndex === null) return
    event.preventDefault()
    const nextPanel = READER_PANELS[nextIndex]
    setPanel(nextPanel)
    document.getElementById(`reader-tab-${nextPanel}`)?.focus()
  }

  if (loading) {
    return <section className="reader-page"><Card className="reader-state" role="status" aria-live="polite"><StatusBadge tone="working">불러오는 중</StatusBadge><h1 className="card-title">비공개 PDF 준비 중</h1><p className="card-description">PaperBridge가 선택한 원문을 가져와 읽을 수 있도록 준비하고 있습니다.</p></Card></section>
  }

  if (loadError || !pdfDocument) {
    return (
      <section className="reader-page">
        <Card className="reader-state" aria-labelledby="reader-error-title">
          <StatusBadge tone="error">문서를 사용할 수 없음</StatusBadge>
          <h1 className="card-title" id="reader-error-title">PaperBridge가 이 PDF를 열지 못했습니다</h1>
          <Alert tone="error">{loadError ?? 'PDF를 불러오는 세션이 예기치 않게 끝났습니다.'}</Alert>
          <div className="inline-actions"><Button onClick={onBackToLibrary}>문서 보관함으로 돌아가기</Button></div>
        </Card>
      </section>
    )
  }

  return (
    <section className="reader-page" aria-label="PaperBridge PDF 리더" onKeyDownCapture={handleReaderKeyDown}>
      <div className="reader-workspace">
        <header className="reader-toolbar">
          <Button variant="secondary" onClick={onBackToLibrary}>보관함으로 돌아가기</Button>
          <div className="reader-context">
            <span className="reader-context-label">비공개 문서</span>
            <span className="reader-context-id">{documentId}</span>
          </div>
          <StatusBadge tone="ready">{`${pageCount}쪽`}</StatusBadge>
        </header>

        <div className="reader-controls" aria-label="PDF 쪽과 확대/축소 조절">
          <div className="inline-actions">
            <Button variant="secondary" onClick={() => moveToPage(currentPage - 1)} disabled={currentPage <= 1}>이전 쪽</Button>
            <label className="reader-page-input">쪽 <Input aria-label="현재 쪽" type="number" min={1} max={pageCount} value={currentPage} onChange={(event) => moveToPage(Number(event.target.value))} /></label>
            <span className="reader-page-count">/ {pageCount}쪽</span>
            <Button variant="secondary" onClick={() => moveToPage(currentPage + 1)} disabled={currentPage >= pageCount}>다음 쪽</Button>
            <Button variant="secondary" aria-pressed={showAllPages} onClick={() => setShowAllPages((current) => !current)}>{showAllPages ? '현재 쪽만 보기' : '모든 쪽 보기'}</Button>
          </div>
          <div className="inline-actions">
            <Button variant="secondary" onClick={() => setZoom((current) => clamp(Math.round((current - 0.1) * 10) / 10, 0.6, 2.4))} disabled={zoom <= 0.6}>축소</Button>
            <span className="reader-zoom-value">{Math.round(zoom * 100)}%</span>
            <Button variant="secondary" onClick={() => setZoom((current) => clamp(Math.round((current + 0.1) * 10) / 10, 0.6, 2.4))} disabled={zoom >= 2.4}>확대</Button>
            <Button variant="secondary" onClick={() => setZoom(1.2)} disabled={zoom === 1.2}>기본값</Button>
          </div>
        </div>

        <div className="reader-canvas" ref={viewerRef} onPointerDown={() => { pointerSelectingRef.current = true }} onMouseUp={() => window.setTimeout(finalizeReaderSelection, 0)} onKeyUp={handleReaderKeyUp}>
          {highlightError ? <Alert tone="error">{highlightError} PaperBridge 연결을 확인한 뒤 하이라이트를 다시 시도하세요.</Alert> : null}
          {scannedPageCount > 0 ? <Alert tone="warning">텍스트 레이어가 없는 쪽 {scannedPageCount}개: 스캔 쪽도 원문으로 읽을 수 있지만 텍스트 레이어가 있는 쪽만 선택할 수 있습니다.</Alert> : null}
          {visiblePages.map((pageNumber) => (
            <div id={`reader-page-${pageNumber}`} key={pageNumber}>
              <PageCanvas
                key={`${documentId}-${pageNumber}`}
                pdfDocument={pdfDocument}
                pageNumber={pageNumber}
                zoom={zoom}
                highlights={highlights}
                isKeyboardFocusable={!showAllPages || pageNumber === currentPage}
                onTextLayerSources={updatePageTextSources}
              />
            </div>
          ))}
        </div>

        {selectedAnchor ? (
        <section className="selection-toolbar" aria-label="선택한 텍스트 작업">
            <span><strong>{selectedAnchor.selectedText}</strong> · {selectedAnchor.pageNumber}쪽에서 선택됨. 다음 작업을 고르세요.</span>
            <div className="inline-actions">
              <Button
                variant="secondary"
                onClick={() => void runSelectionTask('explain')}
                disabled={agentState === 'checking-provider' || agentState === 'running'}
              >
                {agentTask === 'explain' && agentState === 'running' ? '설명 실행 중…' : '설명 시작'}
              </Button>
              <Button
                variant="secondary"
                onClick={() => void runSelectionTask('translate')}
                disabled={agentState === 'checking-provider' || agentState === 'running'}
              >
                {agentTask === 'translate' && agentState === 'running' ? '번역 실행 중…' : '번역 시작'}
              </Button>
              <Button onClick={() => void saveHighlight()} disabled={isSavingHighlight}>{isSavingHighlight ? '저장 중…' : '하이라이트 저장'}</Button>
              <Button variant="secondary" onClick={dismissSelection}>선택 닫기</Button>
            </div>
          </section>
        ) : null}
        <p className="visually-hidden" role="status" aria-live="polite">
          {selectedAnchor ? `${selectedAnchor.pageNumber}쪽 텍스트 작업을 사용할 수 있습니다. Tab 키로 설명 시작, 번역 시작, 하이라이트 저장, 선택 닫기로 이동하세요.` : ''}
        </p>
      </div>

      <Card as="aside" className="reader-sidepanel" aria-label="리더 세부 정보">
        <div className="reader-panel-tabs" role="tablist" aria-label="리더 보조 패널">
          {READER_PANELS.map((tab) => (
            <button className="reader-panel-tab" id={`reader-tab-${tab}`} key={tab} type="button" role="tab" tabIndex={panel === tab ? 0 : -1} aria-selected={panel === tab} aria-controls={`reader-panel-${tab}`} onClick={() => setPanel(tab)} onKeyDown={(event) => handlePanelTabKeyDown(event, tab)}>{tab === 'info' ? '문서 정보' : tab === 'chat' ? 'AI 작업' : `하이라이트 (${highlights.length})`}</button>
          ))}
        </div>

        {panel === 'info' ? (
          <div id="reader-panel-info" role="tabpanel" aria-labelledby="reader-tab-info" className="reader-panel-content">
            <div><p className="section-label">문서 상태</p><h2 className="card-title">원문 정보</h2></div>
            <dl className="detail-list">
              <div><dt>쪽 수</dt><dd>{pageCount}</dd></div>
              <div><dt>텍스트 블록</dt><dd>{graph?.pages.reduce((total, page) => total + page.blocks.length, 0) ?? 0}</dd></div>
              <div><dt>스캔 쪽</dt><dd>{scannedPageCount}</dd></div>
              <div><dt>선택</dt><dd>{selectedAnchor ? `${selectedAnchor.pageNumber}쪽` : '없음'}</dd></div>
            </dl>
            <Alert tone="info">PDF 원문과 저장한 하이라이트는 현재 PaperBridge 세션에 유지됩니다.</Alert>
          </div>
        ) : null}

        {panel === 'chat' ? (
          <div id="reader-panel-chat" role="tabpanel" aria-labelledby="reader-tab-chat" className="reader-panel-content">
            <div>
              <p className="section-label">AI 실행 환경</p>
              <h2 className="card-title">선택한 문장 작업</h2>
              <p className="card-description">원문 위치를 근거로 설명하거나 번역합니다.</p>
            </div>
            {providerStatus?.openRouter.configured ? (
              <p className="agent-provider-state"><StatusBadge tone="ready">연결됨</StatusBadge><span>OpenRouter · {providerStatus.openRouter.modelId}</span></p>
            ) : null}
            {agentState === 'error' && agentError ? (
              <Alert tone="error">
                <span>{agentError}</span>
                <AppLink className="button button--secondary" href="/settings" onNavigate={onOpenSettings}>설정 열기</AppLink>
              </Alert>
            ) : null}
            {agentState === 'checking-provider' ? (
              <Alert tone="info">
                <span>제공자 상태를 확인하고 실행을 준비하는 중입니다.</span>
                <Button variant="secondary" onClick={cancelAgent}>취소</Button>
              </Alert>
            ) : null}
            {agentState === 'cancelled' ? <Alert tone="warning">AI 실행을 취소했습니다. 같은 선택 영역에서 다시 실행할 수 있습니다.</Alert> : null}
            {selectedAnchor ? (
              <div className="agent-selection-card">
                <span className="section-label">{selectedAnchor.pageNumber}쪽 선택 영역</span>
                <p className="reader-selection-context">{selectedAnchor.selectedText}</p>
                {agentState === 'idle' ? <p className="agent-next-step">위 툴바에서 설명 또는 번역을 시작하세요.</p> : null}
              </div>
            ) : <EmptyRow>원문 텍스트를 선택하면 설명과 번역을 실행할 수 있습니다.</EmptyRow>}
            {agentTask && (agentState === 'running' || agentState === 'completed') ? (
              <section className="agent-result" aria-live="polite" aria-busy={agentState === 'running'}>
                <div className="agent-result-heading">
                  <div><span className="section-label">{agentTask === 'explain' ? '설명 결과' : '번역 결과'}</span><strong>{agentState === 'running' ? '생성 중…' : '완료'}</strong></div>
                  {agentState === 'running' ? <Button variant="secondary" onClick={cancelAgent}>실행 취소</Button> : null}
                </div>
                <p className="agent-result-text">{agentText || '응답을 기다리는 중…'}</p>
              </section>
            ) : null}
            {agentTask && agentState === 'error' ? (
              <div className="agent-retry-row">
                <span className="settings-inline-copy">문제 해결 후 같은 선택 영역에서 다시 실행하세요.</span>
                <Button variant="secondary" onClick={() => void runSelectionTask(agentTask)}>다시 실행</Button>
              </div>
            ) : null}
          </div>
        ) : null}

        {panel === 'highlights' ? (
          <div id="reader-panel-highlights" role="tabpanel" aria-labelledby="reader-tab-highlights" className="reader-panel-content">
            <div><p className="section-label">수동 하이라이트</p><h2 className="card-title">저장된 선택 근거</h2></div>
            {highlights.length === 0 ? <EmptyRow>아직 저장한 하이라이트가 없습니다. 읽을 수 있는 텍스트를 선택한 뒤 하이라이트를 저장하세요.</EmptyRow> : (
              <ol className="highlight-list">
                {highlights.map((highlight) => (
                  <li key={highlight.id}>
                    <button className="highlight-jump" onClick={() => moveToHighlight(highlight)}>
                      <span>{highlight.anchor.pageNumber}쪽 · {formatDate(highlight.createdAt)}</span>
                      <strong>{highlight.selectedText || '선택한 PDF 영역'}</strong>
                    </button>
                    <Button variant="secondary" onClick={() => void deleteHighlight(highlight)}>삭제</Button>
                  </li>
                ))}
              </ol>
            )}
          </div>
        ) : null}
      </Card>
    </section>
  )
}
