import { describe, expect, it } from 'vitest'
import { Util } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { createPdfObjectGraph, createPdfPage, layoutPdfJsTextLayer, layoutPdfText, normalizedSelectionRects, PdfTextLayerLifecycle, pdfJsMeasuredScaleX, pdfTextLayerItemIds, surroundingBlockContext } from './pdf'

describe('PDF object graph grouping', () => {
  it('normalizes evidence and groups deterministic reading-order lines and blocks', () => {
    const page = createPdfPage({
      pageNumber: 1,
      width: 612,
      height: 792,
      text: [
        { text: 'Methods', bounds: { x: 0.1, y: 0.08, width: 0.16, height: 0.04 }, fontSize: 0.04, sourceOrder: 0 },
        { text: 'First sentence.', bounds: { x: 0.1, y: 0.2, width: 0.25, height: 0.025 }, sourceOrder: 1 },
        { text: 'Second sentence.', bounds: { x: 0.1, y: 0.24, width: 0.28, height: 0.025 }, sourceOrder: 2 },
      ],
    })
    const graph = createPdfObjectGraph('doc-1', [page], '2026-08-25T00:00:00.000Z')
    expect(page.lines.map((line) => line.text)).toEqual(['Methods', 'First sentence.', 'Second sentence.'])
    expect(page.blocks.map((block) => block.role)).toEqual(['heading', 'paragraph'])
    expect(surroundingBlockContext(graph, {
      documentId: 'doc-1', pageNumber: 1, rects: [{ x: 0.1, y: 0.24, width: 0.2, height: 0.02 }], selectedText: 'Second sentence.',
    })).toContain('First sentence.')
  })

  it('reads sustained two-column text down the left column before the right column', () => {
    const source = {
      pageNumber: 1,
      width: 1_000,
      height: 1_000,
      text: [
        { text: 'L1', bounds: { x: 0.1, y: 0.1, width: 0.06, height: 0.02 }, sourceOrder: 0 },
        { text: 'R1', bounds: { x: 0.6, y: 0.1, width: 0.06, height: 0.02 }, sourceOrder: 1 },
        { text: 'L2', bounds: { x: 0.1, y: 0.14, width: 0.06, height: 0.02 }, sourceOrder: 2 },
        { text: 'R2', bounds: { x: 0.6, y: 0.14, width: 0.06, height: 0.02 }, sourceOrder: 3 },
      ],
    }
    const page = createPdfPage(source)
    const reorderedInput = createPdfPage({ ...source, text: [...source.text].reverse() })

    expect(page.textItems.map((item) => item.id)).toEqual(['p1-t1', 'p1-t3', 'p1-t2', 'p1-t4'])
    expect(page.lines.map((line) => line.text)).toEqual(['L1', 'L2', 'R1', 'R2'])
    expect(page.blocks.map((block) => block.text)).toEqual(['L1 L2', 'R1 R2'])
    expect(reorderedInput).toEqual(page)
  })

  it('keeps a centered title before conventional columns and keeps full-width header/footer evidence outside them', () => {
    const page = createPdfPage({
      pageNumber: 1,
      width: 1_000,
      height: 1_000,
      text: [
        { text: 'Title', bounds: { x: 0.4, y: 0.03, width: 0.2, height: 0.03 }, sourceOrder: 0 },
        { text: 'Abstract', bounds: { x: 0.1, y: 0.07, width: 0.55, height: 0.025 }, sourceOrder: 1 },
        { text: 'L1', bounds: { x: 0.1, y: 0.12, width: 0.1, height: 0.02 }, sourceOrder: 2 },
        { text: 'R1', bounds: { x: 0.6, y: 0.12, width: 0.1, height: 0.02 }, sourceOrder: 3 },
        { text: 'L2', bounds: { x: 0.1, y: 0.16, width: 0.1, height: 0.02 }, sourceOrder: 4 },
        { text: 'R2', bounds: { x: 0.6, y: 0.16, width: 0.1, height: 0.02 }, sourceOrder: 5 },
        { text: 'Footer', bounds: { x: 0.4, y: 0.22, width: 0.15, height: 0.02 }, sourceOrder: 6 },
      ],
    })

    expect(page.lines.map((line) => line.text)).toEqual(['Title', 'Abstract', 'L1', 'L2', 'R1', 'R2', 'Footer'])
  })

  it('falls back to physical order when an interleaved item makes a column layout ambiguous', () => {
    const page = createPdfPage({
      pageNumber: 1,
      width: 1_000,
      height: 1_000,
      text: [
        { text: 'L1', bounds: { x: 0.1, y: 0.1, width: 0.1, height: 0.02 }, sourceOrder: 0 },
        { text: 'R1', bounds: { x: 0.6, y: 0.1, width: 0.1, height: 0.02 }, sourceOrder: 1 },
        { text: 'Aside', bounds: { x: 0.35, y: 0.12, width: 0.1, height: 0.02 }, sourceOrder: 2 },
        { text: 'L2', bounds: { x: 0.1, y: 0.14, width: 0.1, height: 0.02 }, sourceOrder: 3 },
        { text: 'R2', bounds: { x: 0.6, y: 0.14, width: 0.1, height: 0.02 }, sourceOrder: 4 },
      ],
    })

    expect(page.lines.map((line) => line.text)).toEqual(['L1', 'R1', 'Aside', 'L2', 'R2'])
  })

  it('keeps right-to-left two-column pages in right-column-first order', () => {
    const page = createPdfPage({
      pageNumber: 1,
      width: 1_000,
      height: 1_000,
      text: [
        { text: 'R1', bounds: { x: 0.6, y: 0.1, width: 0.06, height: 0.02 }, direction: 'rtl', sourceOrder: 0 },
        { text: 'L1', bounds: { x: 0.1, y: 0.1, width: 0.06, height: 0.02 }, direction: 'rtl', sourceOrder: 1 },
        { text: 'R2', bounds: { x: 0.6, y: 0.14, width: 0.06, height: 0.02 }, direction: 'rtl', sourceOrder: 2 },
        { text: 'L2', bounds: { x: 0.1, y: 0.14, width: 0.06, height: 0.02 }, direction: 'rtl', sourceOrder: 3 },
      ],
    })

    expect(page.lines.map((line) => line.text)).toEqual(['R1', 'R2', 'L1', 'L2'])
  })

  it('normalizes 0/90/180/270 degree PDF.js TextLayer geometry from the same raw text run', () => {
    const itemTransform = [12, 0, 0, 12, 100, 200]
    const layout = (rotation: 0 | 90 | 180 | 270, width: number, height: number) => layoutPdfJsTextLayer({
      width,
      height,
      scale: 1,
      rotation,
      rawWidth: 600,
      rawHeight: 800,
    }, itemTransform, 72)

    expect(layout(0, 600, 800).bounds).toEqual({ x: 0.166667, y: 0.738, width: 0.12, height: 0.015 })
    expect(layout(90, 800, 600).bounds).toEqual({ x: 0.247, y: 0.166667, width: 0.015, height: 0.12 })
    expect(layout(180, 600, 800).bounds).toEqual({ x: 0.713333, y: 0.247, width: 0.12, height: 0.015 })
    expect(layout(270, 800, 600).bounds).toEqual({ x: 0.738, y: 0.713333, width: 0.015, height: 0.12 })
  })

  it('uses PDF.js-style measured widths and preserves IDs across marked/empty text records', () => {
    expect(pdfJsMeasuredScaleX(72, 1, 36)).toBe(2)
    expect(pdfJsMeasuredScaleX(72, 1, 18)).toBe(4)
    expect(pdfJsMeasuredScaleX(72, 1.5, 54)).toBe(2)
    expect(pdfTextLayerItemIds(2, [
      { str: 'A' },
      { type: 'beginMarkedContent' },
      { str: '' },
      { str: 'B' },
    ])).toEqual(['p2-t1', 'p2-t3', 'p2-t4'])

    expect(layoutPdfText({ width: 600, height: 800 }, Util.transform([1, 0, 0, -1, 0, 800], [12, 0, 0, 12, 100, 200]), 72).fontHeight).toBe(12)
  })

  it('cancels a TextLayer once and cancels a layer that arrives after teardown', () => {
    let firstCancelled = 0
    const lifecycle = new PdfTextLayerLifecycle()
    expect(lifecycle.attach({ cancel: () => { firstCancelled += 1 } })).toBe(true)
    lifecycle.cancel()
    lifecycle.cancel()
    expect(firstCancelled).toBe(1)

    let lateCancelled = 0
    expect(lifecycle.attach({ cancel: () => { lateCancelled += 1 } })).toBe(false)
    expect(lateCancelled).toBe(1)
  })
})

describe('PDF selection evidence', () => {
  it('converts browser rectangles into clipped normalized selection coordinates', () => {
    expect(normalizedSelectionRects(
      { left: 100, top: 200, right: 500, bottom: 800, width: 400, height: 600 },
      [{ left: 50, top: 260, right: 250, bottom: 320, width: 200, height: 60 }],
    )).toEqual([{ x: 0, y: 0.1, width: 0.375, height: 0.1 }])
  })
})
