import { describe, expect, it } from 'vitest'
import { createReaderFixtureGraph } from './reader-fixtures'
import {
  clampReaderPage,
  clampReaderZoom,
  createInitialReaderState,
  normalizedReaderRect,
  readerPageViewport,
  readerReducer,
  visibleReaderPages,
} from './reader-state'

describe('reader state machine', () => {
  it('keeps file, parse, viewport, selection, and run transitions independent', () => {
    const graph = createReaderFixtureGraph()
    expect(graph.pages).toHaveLength(3)
    expect(graph.pages.every((page) => page.textItems.length === 0)).toBe(true)
    const ready = readerReducer(createInitialReaderState(), { type: 'file/ready', pdfDocument: null })
    const parsed = readerReducer(ready, { type: 'parse/ready', graph })
    const paged = readerReducer(parsed, { type: 'viewport/page', page: 2 })
    const selected = readerReducer(paged, {
      type: 'selection/set',
      anchor: { documentId: graph.documentId, pageNumber: 2, rects: [{ x: 0.1, y: 0.2, width: 0.2, height: 0.05 }] },
      context: '',
    })
    const running = readerReducer(selected, { type: 'run/checking', task: 'explain' })

    expect(running.file.status).toBe('ready')
    expect(running.parse.status).toBe('ready')
    expect(running.viewport.currentPage).toBe(2)
    expect(running.selection.status).toBe('selected')
    expect(running.run.status).toBe('checking-provider')
    expect(running.selection.anchor?.pageNumber).toBe(2)
  })

  it('enforces zoom and page bounds while preserving all-page mode', () => {
    const state = createInitialReaderState()
    const zoomed = readerReducer(state, { type: 'viewport/zoom', zoom: 4 })
    const paged = readerReducer(zoomed, { type: 'viewport/page', page: clampReaderPage(99, 3) })
    const allPages = readerReducer(paged, { type: 'viewport/toggle-all' })

    expect(zoomed.viewport.zoom).toBe(2.4)
    expect(paged.viewport.currentPage).toBe(3)
    expect(allPages.viewport.showAllPages).toBe(true)
    expect(visibleReaderPages(3, 3, true)).toEqual([1, 2, 3])
    expect(clampReaderZoom(0.1)).toBe(0.6)
  })

  it('records a resize without changing document, zoom, or selection state', () => {
    const graph = createReaderFixtureGraph()
    const selected = readerReducer(
      readerReducer(createInitialReaderState(), { type: 'parse/ready', graph }),
      { type: 'selection/set', anchor: { documentId: graph.documentId, pageNumber: 1, rects: [{ x: 0.1, y: 0.1, width: 0.2, height: 0.1 }] }, context: '' },
    )
    const resized = readerReducer(selected, { type: 'viewport/resize', width: 768, height: 540 })

    expect(resized.viewport.width).toBe(768)
    expect(resized.viewport.height).toBe(540)
    expect(resized.viewport.zoom).toBe(1.2)
    expect(resized.parse.graph?.documentId).toBe(graph.documentId)
    expect(resized.selection.status).toBe('selected')
  })
})

describe('reader viewport and normalized geometry fixtures', () => {
  it('swaps rotated page dimensions without changing normalized bounds', () => {
    expect(readerPageViewport({ width: 600, height: 800 }, 1, 90)).toEqual({ width: 800, height: 600 })
    expect(readerPageViewport({ width: 600, height: 800 }, 1.2, 270)).toEqual({ width: 960, height: 720 })
    expect(normalizedReaderRect({ x: 0.1, y: 0.2, width: 0.3, height: 0.1 }, 0)).toEqual({ x: 0.1, y: 0.2, width: 0.3, height: 0.1 })
  })

  it('normalizes top-left coordinates after every supported rotation', () => {
    const rect = { x: 0.1, y: 0.2, width: 0.3, height: 0.1 }
    expect(normalizedReaderRect(rect, 90)).toEqual({ x: 0.7, y: 0.1, width: 0.1, height: 0.3 })
    expect(normalizedReaderRect(rect, 180)).toEqual({ x: 0.6, y: 0.7, width: 0.3, height: 0.1 })
    expect(normalizedReaderRect(rect, 270)).toEqual({ x: 0.2, y: 0.6, width: 0.1, height: 0.3 })
  })
})
