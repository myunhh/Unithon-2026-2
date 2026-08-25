import { createSelectionAnchor, normalizeRect } from './selection'
import type { Block, DocumentId, Line, NormRect, Page, PdfObjectGraph, SelectionAnchor, TextItem, TextRange } from './types'

export type PdfTextSource = {
  text: string
  bounds: NormRect
  direction?: TextItem['direction']
  fontName?: string
  fontSize?: number
  sourceOrder: number
}

export type PdfPageSource = {
  pageNumber: number
  width: number
  height: number
  rotation?: Page['rotation']
  text: readonly PdfTextSource[]
}

export type ClientRectLike = {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}

const stable = (value: number) => Math.round(value * 1_000_000) / 1_000_000
const centerY = (rect: NormRect) => rect.y + rect.height / 2
const COLUMN_START_GAP = 0.12

export type PdfTextLayout = {
  left: number
  top: number
  fontHeight: number
  angle: number
  bounds: NormRect
}

export type PdfTextLayoutOptions = {
  /** PDF.js text-content style metrics, used until the visible TextLayer reports DOM bounds. */
  ascent?: number
  descent?: number
  vertical?: boolean
}

export type PdfJsTextLayerViewport = {
  width: number
  height: number
  scale: number
  rotation: number
  rawWidth: number
  rawHeight: number
  rawX?: number
  rawY?: number
}

type PdfTextLayerItemLike = { str?: unknown }

export function pdfTextItemId(pageNumber: number, sourceOrder: number): string {
  return `p${pageNumber}-t${sourceOrder + 1}`
}

/**
 * TextLayer.textDivs contains one entry per text-content item (including empty
 * strings), but omits marked-content records. Keep that exact order when
 * assigning durable selection IDs to its generated DOM nodes.
 */
export function pdfTextLayerItemIds(pageNumber: number, items: readonly unknown[]): string[] {
  return items.flatMap((item, sourceOrder) => {
    if (!item || typeof item !== 'object' || !('str' in item) || typeof (item as PdfTextLayerItemLike).str !== 'string') return []
    return [pdfTextItemId(pageNumber, sourceOrder)]
  })
}

/** Mirrors PDF.js TextLayer's canvas-width / measured-font-width correction. */
export function pdfJsMeasuredScaleX(canvasWidth: number, viewportScale: number, measuredTextWidth: number): number {
  if (!(canvasWidth > 0) || !(viewportScale > 0) || !(measuredTextWidth > 0)) return 1
  return canvasWidth * viewportScale / measuredTextWidth
}

export type CancelablePdfTextLayer = { cancel(): void }

/** Owns one TextLayer render attempt and makes teardown safe across React effect races. */
export class PdfTextLayerLifecycle {
  private cancelled = false
  private layer: CancelablePdfTextLayer | undefined

  attach(layer: CancelablePdfTextLayer): boolean {
    if (this.cancelled) {
      layer.cancel()
      return false
    }
    this.layer = layer
    return true
  }

  cancel() {
    if (this.cancelled) return
    this.cancelled = true
    const layer = this.layer
    this.layer = undefined
    layer?.cancel()
  }
}

function multiplyTransform(left: readonly number[], right: readonly number[]): [number, number, number, number, number, number] {
  const [a1, b1, c1, d1, e1, f1] = left
  const [a2, b2, c2, d2, e2, f2] = right
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ]
}

function textAscentRatio(options: PdfTextLayoutOptions): number {
  if (Number.isFinite(options.ascent)) return Math.max(0, options.ascent as number)
  if (Number.isFinite(options.descent)) return Math.max(0, 1 + (options.descent as number))
  return 0.8
}

function rotateTextLayerPoint(rotation: number, width: number, height: number, point: { x: number; y: number }) {
  switch ((rotation % 360 + 360) % 360) {
    case 90: return { x: height - point.y, y: point.x }
    case 180: return { x: width - point.x, y: height - point.y }
    case 270: return { x: point.y, y: width - point.x }
    default: return point
  }
}

/**
 * Mirrors the supported PDF.js TextLayer geometry: it lays a text run out in
 * unrotated page space, then applies the same page rotation as its container.
 * PDF.js itself measures the font to choose the final scaleX; this helper only
 * supplies the stable normalized evidence rectangle used before DOM bounds are
 * reported from the visible TextLayer.
 */
export function layoutPdfJsTextLayer(
  viewport: PdfJsTextLayerViewport,
  itemTransform: readonly number[],
  renderedTextWidth: number,
  options: PdfTextLayoutOptions = {},
): PdfTextLayout {
  const transform = multiplyTransform(
    [1, 0, 0, -1, -(viewport.rawX ?? 0), (viewport.rawY ?? 0) + viewport.rawHeight],
    itemTransform,
  )
  let angle = Math.atan2(transform[1], transform[0])
  if (options.vertical) angle += Math.PI / 2
  const fontHeight = Math.max(Math.hypot(transform[2], transform[3]), 1)
  const fontAscent = fontHeight * textAscentRatio(options)
  const left = transform[4] + fontAscent * Math.sin(angle)
  const top = transform[5] - fontAscent * Math.cos(angle)
  const textWidth = Math.max(Math.abs(renderedTextWidth), 1)
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const corners = [
    [0, 0],
    [textWidth, 0],
    [0, fontHeight],
    [textWidth, fontHeight],
  ].map(([x, y]) => rotateTextLayerPoint(
    viewport.rotation,
    viewport.rawWidth * viewport.scale,
    viewport.rawHeight * viewport.scale,
    {
      x: (left + x * cos - y * sin) * viewport.scale,
      y: (top + x * sin + y * cos) * viewport.scale,
    },
  ))
  const minX = Math.min(...corners.map((corner) => corner.x))
  const maxX = Math.max(...corners.map((corner) => corner.x))
  const minY = Math.min(...corners.map((corner) => corner.y))
  const maxY = Math.max(...corners.map((corner) => corner.y))
  return {
    left: stable(left * viewport.scale),
    top: stable(top * viewport.scale),
    fontHeight: stable(fontHeight * viewport.scale),
    angle: angle * 180 / Math.PI,
    bounds: normalizeRect({
      x: minX / viewport.width,
      y: minY / viewport.height,
      width: (maxX - minX) / viewport.width,
      height: (maxY - minY) / viewport.height,
    }),
  }
}

function unionRect(rectangles: readonly NormRect[]): NormRect {
  const left = Math.min(...rectangles.map((rect) => rect.x))
  const top = Math.min(...rectangles.map((rect) => rect.y))
  const right = Math.max(...rectangles.map((rect) => rect.x + rect.width))
  const bottom = Math.max(...rectangles.map((rect) => rect.y + rect.height))
  return normalizeRect({ x: stable(left), y: stable(top), width: stable(right - left), height: stable(bottom - top) })
}

function comparePhysicalOrder(left: TextItem, right: TextItem): number {
  const vertical = left.bounds.y - right.bounds.y
  if (Math.abs(vertical) > 0.003) return vertical
  if (left.direction === 'rtl' && right.direction === 'rtl') return right.bounds.x - left.bounds.x
  const horizontal = left.bounds.x - right.bounds.x
  if (Math.abs(horizontal) > 0.001) return horizontal
  return left.order - right.order
}

/**
 * Produces a normalized fallback model for text evidence when a visible
 * PDF.js TextLayer has not yet reported its measured DOM bounds.
 */
export function layoutPdfText(
  viewport: Pick<PdfPageSource, 'width' | 'height'>,
  transform: readonly number[],
  renderedTextWidth: number,
  options: PdfTextLayoutOptions = {},
): PdfTextLayout {
  const a = Number.isFinite(transform[0]) ? transform[0] : 0
  const b = Number.isFinite(transform[1]) ? transform[1] : 0
  const c = Number.isFinite(transform[2]) ? transform[2] : 0
  const d = Number.isFinite(transform[3]) ? transform[3] : 0
  const originX = Number.isFinite(transform[4]) ? transform[4] : 0
  const baseline = Number.isFinite(transform[5]) ? transform[5] : 0
  const fontHeight = Math.max(Math.hypot(c, d), 1)
  const textWidth = Math.max(Math.abs(renderedTextWidth), 1)
  let angle = Math.atan2(b, a)
  if (options.vertical) angle += Math.PI / 2
  const ascentRatio = textAscentRatio(options)
  const fontAscent = fontHeight * ascentRatio
  const left = originX + fontAscent * Math.sin(angle)
  const top = baseline - fontAscent * Math.cos(angle)
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const corners = [
    [0, 0],
    [textWidth, 0],
    [0, fontHeight],
    [textWidth, fontHeight],
  ].map(([x, y]) => ({ x: left + x * cos - y * sin, y: top + x * sin + y * cos }))
  const minX = Math.min(...corners.map((corner) => corner.x))
  const maxX = Math.max(...corners.map((corner) => corner.x))
  const minY = Math.min(...corners.map((corner) => corner.y))
  const maxY = Math.max(...corners.map((corner) => corner.y))

  return {
    left,
    top,
    fontHeight,
    angle: angle * 180 / Math.PI,
    bounds: normalizeRect({
      x: minX / viewport.width,
      y: minY / viewport.height,
      width: (maxX - minX) / viewport.width,
      height: (maxY - minY) / viewport.height,
    }),
  }
}

function joinText(items: readonly TextItem[]): string {
  return items.reduce((text, item) => {
    if (!text) return item.text
    if (/\s$/.test(text) || /^\s/.test(item.text) || /^[,.;:!?\])}]/.test(item.text)) return `${text}${item.text}`
    return `${text} ${item.text}`
  }, '').replace(/\s+/g, ' ').trim()
}

function lineRole(line: Line, items: readonly TextItem[]): Block['role'] {
  const text = line.text
  if (/^(?:[-*•]|\d+[.)])\s/.test(text)) return 'list'
  const averageFontSize = items.length === 0 ? 0 : items.reduce((total, item) => total + (item.fontSize ?? 0), 0) / items.length
  if (line.itemIds.length <= 10 && text.length <= 120 && averageFontSize >= 0.028) return 'heading'
  return 'paragraph'
}

function blocksFrom(lines: readonly Line[], itemsById: ReadonlyMap<string, TextItem>, pageNumber: number): Block[] {
  const grouped: Line[][] = []
  for (const line of lines) {
    const previous = grouped.at(-1)
    const lastLine = previous?.at(-1)
    const aligned = lastLine && Math.abs(lastLine.bounds.x - line.bounds.x) < 0.22
    const verticalGap = lastLine ? line.bounds.y - (lastLine.bounds.y + lastLine.bounds.height) : Infinity
    const allowedGap = lastLine ? Math.max(0.024, lastLine.bounds.height * 1.8) : 0
    if (previous && aligned && verticalGap <= allowedGap) previous.push(line)
    else grouped.push([line])
  }

  return grouped.map((group, index) => {
    const allItems = group.flatMap((line) => line.itemIds.map((id) => itemsById.get(id)).filter((item): item is TextItem => Boolean(item)))
    const heading = group.length === 1 ? lineRole(group[0], allItems) : 'paragraph'
    const tabular = group.length > 1 && group.filter((line) => line.itemIds.length > 3).length === group.length
    return {
      id: `p${pageNumber}-b${index + 1}`,
      lineIds: group.map((line) => line.id),
      bounds: unionRect(group.map((line) => line.bounds)),
      text: group.map((line) => line.text).join(' ').replace(/\s+/g, ' ').trim(),
      order: index,
      role: tabular ? 'table' : heading,
    }
  })
}

type CandidateLine = {
  items: readonly TextItem[]
  bounds: NormRect
  text: string
}

function compareCandidatePhysicalOrder(left: CandidateLine, right: CandidateLine): number {
  const vertical = left.bounds.y - right.bounds.y
  if (Math.abs(vertical) > 0.003) return vertical
  const horizontal = left.bounds.x - right.bounds.x
  if (Math.abs(horizontal) > 0.001) return horizontal
  return (left.items[0]?.order ?? 0) - (right.items[0]?.order ?? 0)
}

function inlineGap(previous: TextItem, next: TextItem): number {
  if (previous.direction === 'rtl' && next.direction === 'rtl') {
    return previous.bounds.x - (next.bounds.x + next.bounds.width)
  }
  return next.bounds.x - (previous.bounds.x + previous.bounds.width)
}

function candidateLinesFrom(items: readonly TextItem[]): CandidateLine[] {
  const groups: TextItem[][] = []
  for (const item of items) {
    const current = groups.at(-1)
    const last = current?.at(-1)
    const tolerance = last ? Math.max(0.009, Math.min(0.04, Math.max(last.bounds.height, item.bounds.height) * 0.8)) : 0
    const samePhysicalLine = Boolean(current && last && Math.abs(centerY(last.bounds) - centerY(item.bounds)) <= tolerance)
    // pdfjs commonly emits phrases rather than individual words. A large
    // horizontal gap on the same baseline is therefore a reliable column seam,
    // not an ordinary inter-word gap.
    const separateColumn = Boolean(last && inlineGap(last, item) > Math.max(0.12, Math.max(last.bounds.height, item.bounds.height) * 6))
    if (current && samePhysicalLine && !separateColumn) current.push(item)
    else groups.push([item])
  }

  return groups.map((group) => {
    const ordered = [...group].sort(comparePhysicalOrder)
    return {
      items: ordered,
      bounds: unionRect(ordered.map((item) => item.bounds)),
      text: joinText(ordered),
    }
  })
}

function dominantDirection(lines: readonly CandidateLine[]): TextItem['direction'] {
  const counts = new Map<TextItem['direction'], number>()
  for (const item of lines.flatMap((line) => line.items)) {
    counts.set(item.direction, (counts.get(item.direction) ?? 0) + 1)
  }
  return [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] ?? 'ltr'
}

/**
 * Orders conventional multi-column text by column, while retaining the old
 * top-to-bottom behavior when there is no sustained second column. A column
 * must contain at least two line segments and overlap another column
 * vertically, which avoids treating an indented single-column paragraph as a
 * second column.
 */
function columnAwareLines(lines: readonly CandidateLine[]): CandidateLine[] {
  const physical = [...lines].sort(compareCandidatePhysicalOrder)
  if (physical.length < 4) return physical

  const clusters: Array<{ start: number; lines: CandidateLine[] }> = []
  for (const line of [...physical].sort((left, right) => left.bounds.x - right.bounds.x || left.bounds.y - right.bounds.y)) {
    const current = clusters.at(-1)
    if (current && line.bounds.x - current.start <= COLUMN_START_GAP) current.lines.push(line)
    else clusters.push({ start: line.bounds.x, lines: [line] })
  }
  // Reading columns reliably is a two-column case. More columns, nested
  // columns, and mixed sidebars need source-safe physical order instead of a
  // confident-looking but invented sequence.
  const candidateColumns = clusters.filter((cluster) => cluster.lines.length >= 2)
  const columnPairs: Array<readonly [{ start: number; lines: CandidateLine[] }, { start: number; lines: CandidateLine[] }]> = []
  for (let leftIndex = 0; leftIndex < candidateColumns.length - 1; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < candidateColumns.length; rightIndex += 1) {
      const left = candidateColumns[leftIndex]
      const right = candidateColumns[rightIndex]
      if (right.start - left.start < COLUMN_START_GAP * 1.5) continue
      const pairStart = Math.max(
        Math.min(...left.lines.map((line) => line.bounds.y)),
        Math.min(...right.lines.map((line) => line.bounds.y)),
      )
      const pairEnd = Math.min(
        Math.max(...left.lines.map((line) => line.bounds.y + line.bounds.height)),
        Math.max(...right.lines.map((line) => line.bounds.y + line.bounds.height)),
      )
      const overlapsBody = (line: CandidateLine) => line.bounds.y < pairEnd && line.bounds.y + line.bounds.height > pairStart
      if (pairEnd > pairStart && left.lines.filter(overlapsBody).length >= 2 && right.lines.filter(overlapsBody).length >= 2) {
        columnPairs.push([left, right])
      }
    }
  }
  if (columnPairs.length !== 1) return physical
  const [firstCandidate, secondCandidate] = columnPairs[0]

  // A full-width abstract/header can share a left edge with its body, so take
  // it out before calculating the sustained two-column overlap.
  const columnSeparation = secondCandidate.start - firstCandidate.start
  const spanning = new Set(physical.filter((line) => line.bounds.width >= columnSeparation * 0.75))
  const columns = [firstCandidate, secondCandidate].map((column) => ({
    start: column.start,
    lines: column.lines.filter((line) => !spanning.has(line)),
  }))
  if (columns.some((column) => column.lines.length < 2)) return physical

  const overlapStart = Math.max(...columns.map((column) => Math.min(...column.lines.map((line) => line.bounds.y))))
  const overlapEnd = Math.min(...columns.map((column) => Math.max(...column.lines.map((line) => line.bounds.y + line.bounds.height))))
  if (overlapEnd <= overlapStart) return physical

  const columnLines = new Set(columns.flatMap((column) => column.lines))
  const nonColumnLines = physical.filter((line) => !columnLines.has(line))
  const prefix: CandidateLine[] = []
  const suffix: CandidateLine[] = []
  for (const line of nonColumnLines) {
    if (line.bounds.y + line.bounds.height <= overlapStart + 0.003) prefix.push(line)
    else if (line.bounds.y >= overlapEnd - 0.003) suffix.push(line)
    // A sidebar, floating caption, or interleaved evidence inside the column
    // body is ambiguous. Preserve physical/source order rather than moving it.
    else return physical
  }
  const direction = dominantDirection(physical)
  const orderedColumns = columns.map((_, index) => index).sort((left, right) => (
    direction === 'rtl' ? columns[right].start - columns[left].start : columns[left].start - columns[right].start
  ))
  return [
    ...prefix.sort(compareCandidatePhysicalOrder),
    ...orderedColumns.flatMap((columnIndex) => columns[columnIndex].lines
    .sort((left, right) => {
      const vertical = left.bounds.y - right.bounds.y
      if (Math.abs(vertical) > 0.003) return vertical
      return direction === 'rtl' ? right.bounds.x - left.bounds.x : left.bounds.x - right.bounds.x
    })),
    ...suffix.sort(compareCandidatePhysicalOrder),
  ]
}

/** Builds stable TextItem → Line → Block → Page data from normalized PDF text evidence. */
export function createPdfPage(source: PdfPageSource): Page {
  const physicalItems = source.text
    .filter((item) => item.text.trim().length > 0 && item.bounds.width > 0 && item.bounds.height > 0)
    .map((item) => ({
      id: pdfTextItemId(source.pageNumber, item.sourceOrder),
      text: item.text,
      bounds: normalizeRect(item.bounds),
      ...(item.fontName ? { fontName: item.fontName } : {}),
      ...(item.fontSize ? { fontSize: item.fontSize } : {}),
      direction: item.direction ?? 'ltr',
      order: item.sourceOrder,
    }))
    .sort(comparePhysicalOrder)
  const candidates = columnAwareLines(candidateLinesFrom(physicalItems))
  const textItems = candidates.flatMap((candidate) => candidate.items).map((item, index) => ({ ...item, order: index }))
  const itemsById = new Map(textItems.map((item) => [item.id, item]))
  const lines = candidates.map((candidate, index) => ({
      id: `p${source.pageNumber}-l${index + 1}`,
      itemIds: candidate.items.map((item) => item.id),
      bounds: candidate.bounds,
      text: candidate.text,
      order: index,
    }))
  return {
    id: `p${source.pageNumber}`,
    pageNumber: source.pageNumber,
    width: source.width,
    height: source.height,
    rotation: source.rotation ?? 0,
    textItems,
    lines,
    blocks: blocksFrom(lines, itemsById, source.pageNumber),
  }
}

export function createPdfObjectGraph(documentId: DocumentId, pages: readonly Page[], createdAt: string): PdfObjectGraph {
  if (!documentId) throw new Error('PDF 구조에는 문서 ID가 필요합니다.')
  return {
    documentId,
    version: 1,
    pages: [...pages].sort((left, right) => left.pageNumber - right.pageNumber),
    createdAt,
  }
}

function rectsOverlap(left: NormRect, right: NormRect): boolean {
  return left.x < right.x + right.width && left.x + left.width > right.x && left.y < right.y + right.height && left.y + left.height > right.y
}

/** Returns the selected block and its immediate reading-order neighbours as safe local context. */
export function surroundingBlockContext(graph: PdfObjectGraph, anchor: SelectionAnchor): string {
  const page = graph.pages.find((candidate) => candidate.pageNumber === anchor.pageNumber)
  if (!page || page.blocks.length === 0) return ''
  let selectedIndex = page.blocks.findIndex((block) => anchor.rects.some((rect) => rectsOverlap(block.bounds, rect)))
  if (selectedIndex < 0) {
    const targetY = anchor.rects[0]?.y ?? 0
    selectedIndex = page.blocks.reduce((closest, block, index) => (
      Math.abs(block.bounds.y - targetY) < Math.abs(page.blocks[closest].bounds.y - targetY) ? index : closest
    ), 0)
  }
  return page.blocks.slice(Math.max(0, selectedIndex - 1), selectedIndex + 2).map((block) => block.text).join('\n').slice(0, 4_000)
}

export function normalizedSelectionRects(pageRect: ClientRectLike, clientRects: readonly ClientRectLike[]): NormRect[] {
  if (pageRect.width <= 0 || pageRect.height <= 0) return []
  return clientRects
    .filter((rect) => rect.width > 0 && rect.height > 0 && rect.right > pageRect.left && rect.left < pageRect.right && rect.bottom > pageRect.top && rect.top < pageRect.bottom)
    .map((rect) => normalizeRect({
      x: (rect.left - pageRect.left) / pageRect.width,
      y: (rect.top - pageRect.top) / pageRect.height,
      width: rect.width / pageRect.width,
      height: rect.height / pageRect.height,
    }))
    .filter((rect) => rect.width > 0 && rect.height > 0)
}

function spanForNode(node: Node): HTMLElement | null {
  const element = node.nodeType === Node.ELEMENT_NODE ? node as HTMLElement : node.parentElement
  return element?.closest<HTMLElement>('[data-text-item-id]') ?? null
}

function rangeOffset(node: Node, offset: number, span: HTMLElement): number {
  if (node.nodeType === Node.TEXT_NODE) return Math.min(offset, node.textContent?.length ?? 0)
  if (node === span) return offset <= 0 ? 0 : span.textContent?.length ?? 0
  return Math.min(offset, span.textContent?.length ?? 0)
}

/** Converts the browser's native text selection into normalized, persistent PDF evidence. */
export function selectionAnchorFromDom(
  documentId: string,
  pageNumber: number,
  pageElement: HTMLElement,
  selection: Selection,
): SelectionAnchor | null {
  if (selection.rangeCount === 0 || selection.isCollapsed) return null
  const range = selection.getRangeAt(0)
  if (!pageElement.contains(range.commonAncestorContainer)) return null
  const pageRect = pageElement.getBoundingClientRect()
  if (pageRect.width <= 0 || pageRect.height <= 0) return null
  const rects = normalizedSelectionRects(pageRect, Array.from(range.getClientRects()))
  if (rects.length === 0) return null
  const startSpan = spanForNode(range.startContainer)
  const endSpan = spanForNode(range.endContainer)
  const rawSelectedText = selection.toString().replace(/\s+/g, ' ').trim()
  const selectedText = rawSelectedText.slice(0, 4_000)
  // A capped display string is not an exact assertion about the full range.
  // Omit the range in that case so prompt validation cannot mistake a safe
  // truncation for contradictory selection evidence.
  const textRange: TextRange | undefined = rawSelectedText.length <= 4_000 && startSpan && endSpan && startSpan.dataset.textItemId && endSpan.dataset.textItemId
    ? {
        startItemId: startSpan.dataset.textItemId,
        startOffset: rangeOffset(range.startContainer, range.startOffset, startSpan),
        endItemId: endSpan.dataset.textItemId,
        endOffset: rangeOffset(range.endContainer, range.endOffset, endSpan),
      }
    : undefined
  return {
    ...createSelectionAnchor(documentId, pageNumber, rects, textRange),
    selectedText,
  }
}
