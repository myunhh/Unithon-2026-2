import { GlobalWorkerOptions, getDocument, type PDFDocumentProxy, type PDFPageProxy } from 'pdfjs-dist'
import type { TextContent } from 'pdfjs-dist/types/src/display/api'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { createPdfObjectGraph, createPdfPage, layoutPdfJsTextLayer, type PdfTextSource } from '../../domain/pdf'
import { PdfLoadLifecycle } from '../../domain/reader'
import { documentFilePath } from '../../domain/library'
import type { Page } from '../../domain/types'

GlobalWorkerOptions.workerSrc = workerUrl

export class ReaderLoadError extends Error {
  readonly name = 'ReaderLoadError'
}

export type ReaderPdfViewport = {
  readonly width: number
  readonly height: number
  readonly scale: number
  readonly rotation: number
  readonly rawDims: {
    readonly pageWidth: number
    readonly pageHeight: number
    readonly pageX: number
    readonly pageY: number
  }
}

type PdfJsTextItem = {
  readonly str: string
  readonly transform: readonly number[]
  readonly width: number
  readonly height: number
  readonly fontName: string
  readonly dir: 'ltr' | 'rtl' | 'ttb'
}

type PdfJsTextStyle = {
  readonly vertical?: boolean
}

function isTextItem(value: unknown): value is PdfJsTextItem {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return typeof item.str === 'string' && Array.isArray(item.transform) && item.transform.every((value) => typeof value === 'number')
    && typeof item.width === 'number' && typeof item.height === 'number' && typeof item.fontName === 'string'
    && (item.dir === 'ltr' || item.dir === 'rtl' || item.dir === 'ttb')
}

function isReaderRawDims(value: unknown): value is ReaderPdfViewport['rawDims'] {
  if (!value || typeof value !== 'object') return false
  const dims = value as Record<string, unknown>
  return typeof dims.pageWidth === 'number' && typeof dims.pageHeight === 'number'
    && typeof dims.pageX === 'number' && typeof dims.pageY === 'number'
}

export function toReaderViewport(viewport: ReturnType<PDFPageProxy['getViewport']>): ReaderPdfViewport {
  if (!isReaderRawDims(viewport.rawDims)) throw new ReaderLoadError('PaperBridge가 PDF 페이지 크기를 확인하지 못했습니다.')
  return {
    width: viewport.width,
    height: viewport.height,
    scale: viewport.scale,
    rotation: viewport.rotation,
    rawDims: viewport.rawDims,
  }
}

function textSourcesForPage(viewport: ReaderPdfViewport, items: readonly unknown[], styles: Record<string, PdfJsTextStyle> = {}): PdfTextSource[] {
  return items.flatMap((item, index) => {
    if (!isTextItem(item) || !item.str.trim()) return []
    const style = styles[item.fontName]
    const layout = layoutPdfJsTextLayer({
      width: viewport.width,
      height: viewport.height,
      scale: viewport.scale,
      rotation: viewport.rotation,
      rawWidth: viewport.rawDims.pageWidth,
      rawHeight: viewport.rawDims.pageHeight,
      rawX: viewport.rawDims.pageX,
      rawY: viewport.rawDims.pageY,
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

function pageFromTextContent(pageNumber: number, viewport: ReaderPdfViewport, textContent: TextContent): Page {
  return createPdfPage({
    pageNumber,
    width: viewport.width,
    height: viewport.height,
    rotation: viewport.rotation as Page['rotation'],
    text: textSourcesForPage(viewport, textContent.items, textContent.styles),
  })
}

export type ReaderPdfLoadResult = {
  readonly pdfDocument: PDFDocumentProxy
  readonly graph: ReturnType<typeof createPdfObjectGraph>
}

export type ReaderPdfLoadOptions = {
  readonly signal: AbortSignal
  readonly lifecycle: PdfLoadLifecycle
  readonly onParseStatus: (status: 'extracting') => void
}

export async function loadReaderPdf(documentId: string, options: ReaderPdfLoadOptions): Promise<ReaderPdfLoadResult> {
  const response = await fetch(documentFilePath(documentId), {
    signal: options.signal,
    credentials: 'same-origin',
    headers: { accept: 'application/pdf' },
  })
  if (!response.ok) {
    if (response.status === 404) throw new ReaderLoadError('이 문서는 현재 비공개 보관함 세션에 없습니다. 보관함으로 돌아가 열 수 있는 문서를 선택하세요.')
    throw new ReaderLoadError('PaperBridge가 이 비공개 PDF를 열지 못했습니다. 접근 권한을 확인한 뒤 보관함에서 다시 시도하세요.')
  }
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (!options.lifecycle.isActive) throw new DOMException('Reader load disposed', 'AbortError')
  options.onParseStatus('extracting')
  const task = getDocument({ data: bytes })
  if (!options.lifecycle.attach(task)) throw new DOMException('Reader load disposed', 'AbortError')
  const pdfDocument = await task.promise
  if (!options.lifecycle.isActive) throw new DOMException('Reader load disposed', 'AbortError')

  const pages: Page[] = []
  for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
    if (!options.lifecycle.isActive) throw new DOMException('Reader load disposed', 'AbortError')
    const page = await pdfDocument.getPage(pageNumber)
    const viewport = toReaderViewport(page.getViewport({ scale: 1 }))
    const textContent = await page.getTextContent()
    if (!options.lifecycle.isActive) throw new DOMException('Reader load disposed', 'AbortError')
    pages.push(pageFromTextContent(pageNumber, viewport, textContent))
  }
  const graph = createPdfObjectGraph(documentId, pages, new Date().toISOString())
  return { pdfDocument, graph }
}

export function isReaderAbort(error: unknown, signal: AbortSignal): boolean {
  return signal.aborted || (error instanceof DOMException && error.name === 'AbortError')
}
