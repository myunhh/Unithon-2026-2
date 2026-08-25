import { useEffect, useRef, useState } from 'react'
import { TextLayer, type PDFDocumentProxy, type PDFPageProxy } from 'pdfjs-dist'
import type { TextContent } from 'pdfjs-dist/types/src/display/api'
import { Alert } from '../../components/Alert'
import { normalizedSelectionRects, PdfTextLayerLifecycle, pdfTextLayerItemIds, type PdfTextSource } from '../../domain/pdf'
import type { ReaderHighlight } from '../../domain/reader'
import type { Page } from '../../domain/types'
import { toReaderViewport, type ReaderPdfViewport } from './reader-file'

type PdfJsTextItem = {
  readonly str: string
  readonly transform: readonly number[]
  readonly width: number
  readonly height: number
  readonly fontName: string
  readonly dir: 'ltr' | 'rtl' | 'ttb'
}

function isTextItem(value: unknown): value is PdfJsTextItem {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return typeof item.str === 'string' && Array.isArray(item.transform) && item.transform.every((value) => typeof value === 'number')
    && typeof item.width === 'number' && typeof item.height === 'number' && typeof item.fontName === 'string'
    && (item.dir === 'ltr' || item.dir === 'rtl' || item.dir === 'ttb')
}

function textLayerRotationTransform(rotation: number): string {
  switch ((rotation % 360 + 360) % 360) {
    case 90: return 'rotate(90deg) translateY(-100%)'
    case 180: return 'rotate(180deg) translate(-100%, -100%)'
    case 270: return 'rotate(270deg) translateX(-100%)'
    default: return 'none'
  }
}

function configurePdfJsTextLayer(container: HTMLDivElement, viewport: ReaderPdfViewport): void {
  container.style.width = `${viewport.rawDims.pageWidth * viewport.scale}px`
  container.style.height = `${viewport.rawDims.pageHeight * viewport.scale}px`
  container.style.transform = textLayerRotationTransform(viewport.rotation)
  container.style.transformOrigin = '0 0'
  container.style.setProperty('--total-scale-factor', String(viewport.scale))
  container.style.setProperty('--text-scale-factor', 'calc(var(--total-scale-factor) * var(--min-font-size))')
  container.style.setProperty('--min-font-size-inv', 'calc(1 / var(--min-font-size))')
}

function decorateTextDiv(div: HTMLElement, textItemId: string): void {
  div.classList.add('pdf-text-item')
  div.dataset.textItemId = textItemId
  div.style.fontSize = 'calc(var(--text-scale-factor) * var(--font-height))'
  div.style.transform = 'rotate(var(--rotate, 0deg)) scaleX(var(--scale-x, 1)) scale(var(--min-font-size-inv, 1))'
  div.style.userSelect = 'text'
}

function textSourcesFromRenderedLayer(pageElement: HTMLElement, textContent: TextContent, textDivs: readonly HTMLElement[]): PdfTextSource[] {
  const pageRect = pageElement.getBoundingClientRect()
  if (pageRect.width <= 0 || pageRect.height <= 0) return []
  const textRuns = textContent.items.flatMap((item, sourceOrder) => isTextItem(item) ? [{ item, sourceOrder }] : [])
  return textRuns.flatMap(({ item, sourceOrder }, textIndex) => {
    const div = textDivs[textIndex]
    if (!div || !item.str.trim()) return []
    const bounds = normalizedSelectionRects(pageRect, [div.getBoundingClientRect()])[0]
    if (!bounds) return []
    return [{ text: item.str, bounds, direction: item.dir, fontName: item.fontName, fontSize: Math.min(bounds.width, bounds.height), sourceOrder }]
  })
}

export type PageCanvasProps = {
  readonly pdfDocument: PDFDocumentProxy
  readonly pageNumber: number
  readonly zoom: number
  readonly highlights: readonly ReaderHighlight[]
  readonly isKeyboardFocusable: boolean
  readonly onTextLayerSources: (pageNumber: number, viewport: ReaderPdfViewport, text: PdfTextSource[]) => void
}

export function PageCanvas({ pdfDocument, pageNumber, zoom, highlights, isKeyboardFocusable, onTextLayerSources }: PageCanvasProps) {
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
    const lifecycle = new PdfTextLayerLifecycle()
    let layoutFrame: number | null = null
    const canvas = canvasRef.current
    const surface = surfaceRef.current
    const textLayerContainer = textLayerRef.current
    textLayerContainer.replaceChildren()
    setRenderError(null)
    const render = async () => {
      try {
        const viewport = page.getViewport({ scale: zoom })
        const readerViewport = toReaderViewport(viewport)
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
        if (!lifecycle.attach(textLayer)) return
        configurePdfJsTextLayer(textLayerContainer, readerViewport)
        await textLayer.render()
        if (!active) return
        const itemIds = pdfTextLayerItemIds(pageNumber, textContent.items)
        textLayer.textDivs.forEach((div, index) => {
          const textItemId = itemIds[index]
          if (textItemId) decorateTextDiv(div, textItemId)
        })
        layoutFrame = window.requestAnimationFrame(() => {
          if (!active) return
          const text = textSourcesFromRenderedLayer(surface, textContent, textLayer?.textDivs ?? [])
          if (text.length > 0) onTextLayerSources(pageNumber, readerViewport, text)
        })
      } catch {
        if (active) setRenderError(`${pageNumber}쪽을 표시하지 못했습니다.`)
      }
    }
    void render()
    return () => {
      active = false
      if (layoutFrame !== null) window.cancelAnimationFrame(layoutFrame)
      lifecycle.cancel()
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
          {pageHighlights.flatMap((highlight) => highlight.anchor.rects.map((rect, index) => <span className="pdf-highlight" key={`${highlight.id}-${index}`} style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%` }} />))}
        </div>
        <div ref={textLayerRef} className="pdf-text-layer" role="document" tabIndex={isKeyboardFocusable ? 0 : -1} aria-label={`선택 가능한 PDF ${pageNumber}쪽 텍스트. 텍스트를 선택하면 다음 작업을 사용할 수 있습니다.`} />
      </div>
      {page && hasTextLayer === false ? <Alert tone="warning">텍스트 레이어 없음: 스캔 이미지로 보이는 쪽입니다. 원문은 읽을 수 있지만 텍스트 선택은 지원하지 않습니다.</Alert> : null}
    </article>
  )
}

export type ReaderFixturePageProps = {
  readonly pageNumber: number
  readonly page: Page
  readonly zoom: number
  readonly rotation: 0 | 90 | 180 | 270
  readonly isKeyboardFocusable: boolean
}

export function ReaderFixturePage({ pageNumber, page, zoom, rotation, isKeyboardFocusable }: ReaderFixturePageProps) {
  const width = page.width * zoom
  const height = page.height * zoom
  const rotated = rotation === 90 || rotation === 270
  return (
    <article className="pdf-page reader-fixture-page" aria-label={`데모 fixture ${pageNumber}쪽`}>
      <div className="pdf-page-label">{pageNumber}쪽 · fixture</div>
      <div className="pdf-page-surface reader-fixture-surface" data-reader-page-number={pageNumber} data-rotation={rotation} tabIndex={isKeyboardFocusable ? 0 : -1} aria-label="본문 없이 페이지 기하와 뷰포트 상태만 확인하는 데모" style={{ width: `${rotated ? height : width}px`, height: `${rotated ? width : height}px` }}>
        <div className="reader-fixture-sheet" aria-hidden="true">
          <span className="reader-fixture-rule reader-fixture-rule--wide" />
          <span className="reader-fixture-rule reader-fixture-rule--medium" />
          <span className="reader-fixture-rule reader-fixture-rule--short" />
          <span className="reader-fixture-rule reader-fixture-rule--wide" />
          <span className="reader-fixture-rule reader-fixture-rule--medium" />
          <span className="reader-fixture-block" />
          <span className="reader-fixture-rule reader-fixture-rule--short" />
          <span className="reader-fixture-rule reader-fixture-rule--wide" />
        </div>
      </div>
    </article>
  )
}
