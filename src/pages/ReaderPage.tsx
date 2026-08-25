import { useCallback, useEffect, useMemo, useReducer, useRef, type KeyboardEvent } from 'react'
import { Alert } from '../components/Alert'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { StatusBadge } from '../components/StatusBadge'
import { buildAgentPrompt } from '../domain/agent-prompts'
import { AgentGatewayError, createAgentGateway, type AgentRun } from '../domain/agent-gateway'
import { providerClient } from '../domain/providers'
import { createPdfPage, selectionAnchorFromDom, surroundingBlockContext, type PdfTextSource } from '../domain/pdf'
import { createReaderHighlight, listReaderHighlights, PdfLoadLifecycle, removeReaderHighlight, type ReaderHighlight } from '../domain/reader'
import type { SelectionAnchor } from '../domain/types'
import { PageCanvas, ReaderFixturePage } from '../features/reader/PdfPageCanvas'
import { ReaderSidePanel } from '../features/reader/ReaderSidePanel'
import { SelectionToolbar } from '../features/reader/SelectionToolbar'
import { ReaderToolbar } from '../features/reader/ReaderToolbar'
import { createReaderFixtureGraph, isReaderFixture, readerFixtureDetails } from '../features/reader/reader-fixtures'
import { isReaderAbort, loadReaderPdf, ReaderLoadError, type ReaderPdfViewport } from '../features/reader/reader-file'
import {
  clampReaderPage,
  createInitialReaderState,
  readerReducer,
  type AgentTask,
  type ReaderRotation,
} from '../features/reader/reader-state'
import './ReaderPage.css'

type ReaderPageProps = {
  readonly documentId: string
  readonly onBackToLibrary: () => void
  readonly onOpenSettings: () => void
}

function sameAnchor(left: SelectionAnchor | null, right: SelectionAnchor): boolean {
  return left?.documentId === right.documentId
    && left.pageNumber === right.pageNumber
    && left.selectedText === right.selectedText
    && JSON.stringify(left.rects) === JSON.stringify(right.rects)
    && JSON.stringify(left.textRange) === JSON.stringify(right.textRange)
}

function closestReaderSurface(node: Node): HTMLElement | null {
  const element = node.nodeType === Node.ELEMENT_NODE ? node as HTMLElement : node.parentElement
  return element?.closest<HTMLElement>('[data-reader-page-number]') ?? null
}

function readerRotation(value: number): ReaderRotation {
  const normalized = ((value % 360) + 360) % 360
  return normalized === 90 || normalized === 180 || normalized === 270 ? normalized : 0
}

function loadErrorMessage(error: unknown): string {
  if (error instanceof ReaderLoadError) return error.message
  return 'PaperBridge가 이 PDF를 불러오지 못했습니다. 파일을 확인한 뒤 보관함에서 다시 시도하세요.'
}

function assertNever(value: never): never {
  throw new Error(`Unexpected reader event: ${JSON.stringify(value)}`)
}

export function ReaderPage({ documentId, onBackToLibrary, onOpenSettings }: ReaderPageProps) {
  const [state, dispatch] = useReducer(readerReducer, undefined, createInitialReaderState)
  const viewerRef = useRef<HTMLDivElement>(null)
  const pointerSelectingRef = useRef(false)
  const agentRunRef = useRef<AgentRun | null>(null)
  const agentControllerRef = useRef<AbortController | null>(null)
  const agentCancelRequestedRef = useRef(false)
  const fixture = isReaderFixture(documentId)
  const graph = state.parse.graph
  const pageCount = graph?.pages.length ?? 0
  const visiblePages = useMemo(() => {
    if (!graph) return []
    return state.viewport.showAllPages
      ? graph.pages.map((page) => page.pageNumber)
      : [clampReaderPage(state.viewport.currentPage, pageCount)]
  }, [graph, pageCount, state.viewport.currentPage, state.viewport.showAllPages])
  const scannedPageCount = graph?.pages.filter((page) => page.textItems.length === 0).length ?? 0
  const selectionContext = state.selection.anchor && graph
    ? surroundingBlockContext(graph, state.selection.anchor)
    : ''

  useEffect(() => {
    const lifecycle = new PdfLoadLifecycle()
    const controller = new AbortController()
    dispatch({ type: 'reader/reset' })
    const load = async () => {
      if (fixture) {
        dispatch({ type: 'file/ready', pdfDocument: null })
        dispatch({ type: 'parse/ready', graph: createReaderFixtureGraph(documentId) })
        return
      }
      dispatch({ type: 'file/loading' })
      dispatch({ type: 'parse/queued' })
      try {
        const loaded = await loadReaderPdf(documentId, {
          signal: controller.signal,
          lifecycle,
          onParseStatus: () => dispatch({ type: 'parse/extracting' }),
        })
        if (!lifecycle.isActive) return
        dispatch({ type: 'file/ready', pdfDocument: loaded.pdfDocument })
        dispatch({ type: 'parse/ready', graph: loaded.graph })
      } catch (error) {
        if (!lifecycle.isActive || isReaderAbort(error, controller.signal)) return
        const message = loadErrorMessage(error)
        dispatch({ type: 'file/error', message })
        dispatch({ type: 'parse/error', message })
      }
    }
    void load()
    return () => {
      controller.abort()
      lifecycle.dispose()
    }
  }, [documentId, fixture])

  useEffect(() => {
    if (fixture) {
      dispatch({ type: 'highlights/set', items: [] })
      return
    }
    const controller = new AbortController()
    void listReaderHighlights(documentId, controller.signal).then((items) => {
      if (!controller.signal.aborted) dispatch({ type: 'highlights/set', items })
    }).catch((error: unknown) => {
      if (!isReaderAbort(error, controller.signal)) dispatch({ type: 'highlights/error', message: '하이라이트를 불러오지 못했습니다.' })
    })
    return () => controller.abort()
  }, [documentId, fixture])

  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return
      dispatch({ type: 'viewport/resize', width: Math.round(entry.contentRect.width), height: Math.round(entry.contentRect.height) })
    })
    observer.observe(viewer)
    return () => observer.disconnect()
  }, [state.file.status])

  const finalizeReaderSelection = useCallback(() => {
    const viewer = viewerRef.current
    const selection = window.getSelection()
    if (!viewer || !selection) return
    if (selection.rangeCount === 0 || selection.isCollapsed) {
      if (selection.anchorNode && viewer.contains(selection.anchorNode)) dispatch({ type: 'selection/clear' })
      return
    }
    const range = selection.getRangeAt(0)
    const startSurface = closestReaderSurface(range.startContainer)
    const endSurface = closestReaderSurface(range.endContainer)
    const touchesReader = Boolean((startSurface && viewer.contains(startSurface)) || (endSurface && viewer.contains(endSurface)))
    if (!startSurface || startSurface !== endSurface || !viewer.contains(startSurface)) {
      if (touchesReader) dispatch({ type: 'selection/clear' })
      return
    }
    const pageNumber = Number(startSurface.dataset.readerPageNumber)
    if (!Number.isInteger(pageNumber) || pageNumber < 1) return
    const anchor = selectionAnchorFromDom(documentId, pageNumber, startSurface, selection)
    if (!anchor?.selectedText) return
    if (!sameAnchor(state.selection.anchor, anchor)) {
      dispatch({ type: 'selection/set', anchor, context: graph ? surroundingBlockContext(graph, anchor) : '' })
    }
  }, [documentId, graph, state.selection.anchor])

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

  const dismissSelection = useCallback(() => {
    const selectedPage = state.selection.anchor?.pageNumber
    window.getSelection()?.removeAllRanges()
    dispatch({ type: 'selection/clear' })
    if (!selectedPage) return
    window.requestAnimationFrame(() => viewerRef.current?.querySelector<HTMLElement>(`[data-reader-page-number="${selectedPage}"] .pdf-text-layer`)?.focus())
  }, [state.selection.anchor?.pageNumber])

  const updatePageTextSources = useCallback((pageNumber: number, viewport: ReaderPdfViewport, text: PdfTextSource[]) => {
    const page = createPdfPage({
      pageNumber,
      width: viewport.width,
      height: viewport.height,
      rotation: readerRotation(viewport.rotation),
      text,
    })
    dispatch({ type: 'parse/page-sources', page })
  }, [])

  const moveToPage = useCallback((page: number) => {
    dispatch({ type: 'viewport/page', page: clampReaderPage(page, pageCount) })
    if (state.viewport.showAllPages) dispatch({ type: 'viewport/toggle-all' })
  }, [pageCount, state.viewport.showAllPages])

  const cancelAgent = useCallback(() => {
    if (state.run.status !== 'checking-provider' && state.run.status !== 'running') return
    agentCancelRequestedRef.current = true
    agentRunRef.current?.cancel()
    agentControllerRef.current?.abort()
    dispatch({ type: 'run/cancelled' })
  }, [state.run.status])

  const runSelectionTask = useCallback(async (task: AgentTask) => {
    const anchor = state.selection.anchor
    if (!anchor || !graph || state.run.status === 'checking-provider' || state.run.status === 'running') return
    const controller = new AbortController()
    agentControllerRef.current?.abort()
    agentRunRef.current = null
    agentControllerRef.current = controller
    agentCancelRequestedRef.current = false
    dispatch({ type: 'run/checking', task })
    dispatch({ type: 'panel/set', panel: 'chat' })
    try {
      if (fixture) {
        dispatch({ type: 'run/running' })
        dispatch({ type: 'run/result', text: '이 데모는 PDF 본문 없이 파일·파싱·뷰포트·선택 상태 전이만 확인합니다.' })
        dispatch({ type: 'run/completed' })
        return
      }
      let providerStatus = state.providerStatus
      if (!providerStatus) {
        providerStatus = await providerClient.getStatus(controller.signal)
        if (!controller.signal.aborted) dispatch({ type: 'provider/set', status: providerStatus })
      }
      if (controller.signal.aborted || agentCancelRequestedRef.current) return
      if (!providerStatus.openRouter.configured) {
        dispatch({ type: 'run/error', message: 'OpenRouter가 연결되지 않았습니다. 설정에서 API 키와 모델 ID를 저장한 뒤 다시 실행하세요.' })
        return
      }
      const prompt = buildAgentPrompt({ graph, taskType: task, scope: 'selection', selection: anchor })
      dispatch({ type: 'run/running' })
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
      let runFailed = false
      for await (const event of run.events) {
        if (agentCancelRequestedRef.current || controller.signal.aborted) break
        switch (event.type) {
          case 'started': break
          case 'text-delta': dispatch({ type: 'run/append', text: event.delta }); break
          case 'result': dispatch({ type: 'run/result', text: event.text }); break
          case 'error': runFailed = true; dispatch({ type: 'run/error', message: event.error.message }); break
          case 'done':
            if (event.outcome === 'completed' && !runFailed) dispatch({ type: 'run/completed' })
            else if (event.outcome === 'cancelled') dispatch({ type: 'run/cancelled' })
            else if (!runFailed) dispatch({ type: 'run/error', message: 'AI 실행을 완료하지 못했습니다. 잠시 후 다시 시도하세요.' })
            break
          default: assertNever(event)
        }
      }
    } catch (error) {
      if (controller.signal.aborted || agentCancelRequestedRef.current) return
      dispatch({ type: 'run/error', message: error instanceof AgentGatewayError ? error.message : '선택한 텍스트 작업을 완료하지 못했습니다. 텍스트를 다시 선택한 뒤 재시도하세요.' })
    } finally {
      if (agentControllerRef.current === controller) {
        agentControllerRef.current = null
        agentRunRef.current = null
      }
    }
  }, [documentId, fixture, graph, state.providerStatus, state.run.status, state.selection.anchor])

  useEffect(() => () => {
    agentCancelRequestedRef.current = true
    agentRunRef.current?.cancel()
    agentControllerRef.current?.abort()
  }, [documentId])

  const saveHighlight = useCallback(async () => {
    const anchor = state.selection.anchor
    if (!anchor || state.savingHighlight) return
    dispatch({ type: 'highlights/saving', saving: true })
    dispatch({ type: 'highlight-error/clear' })
    try {
      const saved: ReaderHighlight = fixture
        ? { id: 'fixture-highlight-1', documentId, anchor, selectedText: anchor.selectedText ?? '', context: selectionContext, createdAt: '2026-01-01T00:00:00.000Z' }
        : await createReaderHighlight(documentId, { anchor, selectedText: anchor.selectedText ?? '', context: selectionContext })
      dispatch({ type: 'highlights/add', item: saved })
      dispatch({ type: 'selection/clear' })
      dispatch({ type: 'panel/set', panel: 'highlights' })
      window.getSelection()?.removeAllRanges()
    } catch {
      dispatch({ type: 'highlights/error', message: '하이라이트를 저장하지 못했습니다.' })
    } finally {
      dispatch({ type: 'highlights/saving', saving: false })
    }
  }, [documentId, fixture, selectionContext, state.savingHighlight, state.selection.anchor])

  const deleteHighlight = useCallback(async (highlight: ReaderHighlight) => {
    dispatch({ type: 'highlight-error/clear' })
    try {
      if (!fixture) await removeReaderHighlight(documentId, highlight.id)
      dispatch({ type: 'highlights/remove', id: highlight.id })
    } catch {
      dispatch({ type: 'highlights/error', message: '하이라이트를 삭제하지 못했습니다.' })
    }
  }, [documentId, fixture])

  const moveToHighlight = useCallback((highlight: ReaderHighlight) => {
    moveToPage(highlight.anchor.pageNumber)
    window.setTimeout(() => document.querySelector<HTMLElement>(`[data-reader-page-number="${highlight.anchor.pageNumber}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 0)
  }, [moveToPage])

  const handleReaderKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Escape' || !state.selection.anchor) return
    event.preventDefault()
    dismissSelection()
  }

  const handleReaderKeyUp = (event: KeyboardEvent<HTMLDivElement>) => {
    const isSelectionKey = event.shiftKey || event.key === 'Shift'
      || ['ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'End', 'Home'].includes(event.key)
      || ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a')
    if (isSelectionKey) window.setTimeout(finalizeReaderSelection, 0)
  }

  if (state.file.status === 'loading' || state.parse.status === 'queued' || state.parse.status === 'extracting') {
    return <section className="reader-page reader-page--state"><Card className="reader-state" role="status" aria-live="polite"><StatusBadge tone="working">진행 중</StatusBadge><h1 className="card-title">비공개 PDF 준비 중</h1><p className="card-description">PaperBridge가 선택한 원문을 읽을 수 있도록 파일과 파싱 상태를 준비하고 있습니다.</p></Card></section>
  }

  if (state.file.status === 'error' || !graph || state.parse.status === 'error') {
    return <section className="reader-page reader-page--state"><Card className="reader-state" aria-labelledby="reader-error-title"><StatusBadge tone="error">오류</StatusBadge><h1 className="card-title" id="reader-error-title">PaperBridge가 이 PDF를 열지 못했습니다</h1><Alert tone="error">{state.file.error ?? state.parse.error ?? 'PDF를 불러오는 세션이 예기치 않게 끝났습니다.'}</Alert><div className="inline-actions"><Button onClick={onBackToLibrary}>문서 보관함으로 돌아가기</Button></div></Card></section>
  }

  return (
    <section className="reader-page" aria-label="PaperBridge PDF 리더" data-reader-mode={fixture ? 'fixture' : 'pdf'} onKeyDownCapture={handleReaderKeyDown}>
      <div className="reader-workspace" aria-label="PDF 읽기 작업 공간">
        <ReaderToolbar
          documentId={documentId}
          pageCount={pageCount}
          currentPage={state.viewport.currentPage}
          zoom={state.viewport.zoom}
          showAllPages={state.viewport.showAllPages}
          fileStatus={state.file.status}
          parseStatus={state.parse.status}
          parseError={state.parse.error}
          sourceLabel={fixture ? readerFixtureDetails.sourceLabel : null}
          onBackToLibrary={onBackToLibrary}
          onPageChange={moveToPage}
          onZoomChange={(zoom) => dispatch({ type: 'viewport/zoom', zoom })}
          onToggleAllPages={() => dispatch({ type: 'viewport/toggle-all' })}
        />
        <div className="reader-canvas" ref={viewerRef} role="region" aria-label="PDF 문서" onPointerDown={() => { pointerSelectingRef.current = true }} onMouseUp={() => window.setTimeout(finalizeReaderSelection, 0)} onKeyUp={handleReaderKeyUp}>
          {state.highlightError ? <Alert tone="error">{state.highlightError} PaperBridge 연결을 확인한 뒤 하이라이트를 다시 시도하세요.</Alert> : null}
          {scannedPageCount > 0 && !fixture ? <Alert tone="warning">텍스트 레이어가 없는 쪽 {scannedPageCount}개: 스캔 쪽도 원문으로 읽을 수 있지만 텍스트가 있는 쪽만 선택할 수 있습니다.</Alert> : null}
          {visiblePages.map((pageNumber) => {
            const page = graph.pages.find((item) => item.pageNumber === pageNumber)
            if (!page) return null
            return <div id={`reader-page-${pageNumber}`} key={pageNumber}>{fixture || !state.file.pdfDocument
              ? <ReaderFixturePage pageNumber={pageNumber} page={page} zoom={state.viewport.zoom} rotation={state.viewport.rotation} isKeyboardFocusable={!state.viewport.showAllPages || pageNumber === state.viewport.currentPage} />
              : <PageCanvas pageNumber={pageNumber} pdfDocument={state.file.pdfDocument} zoom={state.viewport.zoom} highlights={state.highlights} isKeyboardFocusable={!state.viewport.showAllPages || pageNumber === state.viewport.currentPage} onTextLayerSources={updatePageTextSources} />}</div>
          })}
        </div>
        <SelectionToolbar selection={state.selection.anchor} run={state.run} savingHighlight={state.savingHighlight} onRun={(task) => void runSelectionTask(task)} onSaveHighlight={() => void saveHighlight()} onDismiss={dismissSelection} />
        <p className="visually-hidden" role="status" aria-live="polite">{state.selection.anchor ? `${state.selection.anchor.pageNumber}쪽 텍스트 작업을 사용할 수 있습니다. Tab 키로 다음 작업으로 이동하세요.` : ''}</p>
      </div>
      <ReaderSidePanel panel={state.panel} fileStatus={state.file.status} parseStatus={state.parse.status} graph={graph} selection={state.selection.anchor} run={state.run} highlights={state.highlights} providerStatus={state.providerStatus} onPanelChange={(panel) => dispatch({ type: 'panel/set', panel })} onOpenSettings={onOpenSettings} onCancelRun={cancelAgent} onRetryRun={(task) => void runSelectionTask(task)} onDeleteHighlight={(highlight) => void deleteHighlight(highlight)} onMoveToHighlight={moveToHighlight} />
    </section>
  )
}
