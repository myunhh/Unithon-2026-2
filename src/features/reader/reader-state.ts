import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { ProviderStatus } from '../../domain/providers'
import type { ReaderHighlight } from '../../domain/reader'
import type { NormRect, Page, PdfObjectGraph, SelectionAnchor } from '../../domain/types'
import { normalizeRect } from '../../domain/selection'

export const READER_FIXTURE_DOCUMENT_ID = 'fixture-reader'
export const READER_PANELS = ['info', 'chat', 'highlights'] as const
export const READER_ZOOM = {
  min: 0.6,
  max: 2.4,
  step: 0.1,
  default: 1.2,
} as const

export type ReaderPanel = (typeof READER_PANELS)[number]
export type AgentTask = 'explain' | 'translate'
export type FileStatus = 'loading' | 'ready' | 'error'
export type ParseStatus = 'queued' | 'extracting' | 'ready' | 'error'
export type SelectionStatus = 'idle' | 'selected'
export type RunStatus = 'idle' | 'checking-provider' | 'running' | 'completed' | 'cancelled' | 'error'
export type ReaderRotation = 0 | 90 | 180 | 270

export type ReaderFileState = {
  readonly status: FileStatus
  readonly pdfDocument: PDFDocumentProxy | null
  readonly error: string | null
}

export type ReaderParseState = {
  readonly status: ParseStatus
  readonly graph: PdfObjectGraph | null
  readonly error: string | null
}

export type ReaderViewportState = {
  readonly currentPage: number
  readonly zoom: number
  readonly rotation: ReaderRotation
  readonly showAllPages: boolean
  readonly width: number
  readonly height: number
}

export type ReaderSelectionState = {
  readonly status: SelectionStatus
  readonly anchor: SelectionAnchor | null
  readonly context: string
}

export type ReaderRunState = {
  readonly status: RunStatus
  readonly task: AgentTask | null
  readonly text: string
  readonly error: string | null
}

export type ReaderState = {
  readonly file: ReaderFileState
  readonly parse: ReaderParseState
  readonly viewport: ReaderViewportState
  readonly selection: ReaderSelectionState
  readonly run: ReaderRunState
  readonly highlights: readonly ReaderHighlight[]
  readonly highlightError: string | null
  readonly savingHighlight: boolean
  readonly panel: ReaderPanel
  readonly providerStatus: ProviderStatus | null
}

export type ReaderAction =
  | { readonly type: 'reader/reset' }
  | { readonly type: 'file/loading' }
  | { readonly type: 'file/ready'; readonly pdfDocument: PDFDocumentProxy | null }
  | { readonly type: 'file/error'; readonly message: string }
  | { readonly type: 'parse/queued' }
  | { readonly type: 'parse/extracting' }
  | { readonly type: 'parse/ready'; readonly graph: PdfObjectGraph }
  | { readonly type: 'parse/page-sources'; readonly page: Page }
  | { readonly type: 'parse/error'; readonly message: string }
  | { readonly type: 'viewport/page'; readonly page: number }
  | { readonly type: 'viewport/zoom'; readonly zoom: number }
  | { readonly type: 'viewport/toggle-all' }
  | { readonly type: 'viewport/resize'; readonly width: number; readonly height: number }
  | { readonly type: 'selection/set'; readonly anchor: SelectionAnchor; readonly context: string }
  | { readonly type: 'selection/clear' }
  | { readonly type: 'run/checking'; readonly task: AgentTask }
  | { readonly type: 'run/running' }
  | { readonly type: 'run/append'; readonly text: string }
  | { readonly type: 'run/result'; readonly text: string }
  | { readonly type: 'run/completed' }
  | { readonly type: 'run/cancelled' }
  | { readonly type: 'run/error'; readonly message: string }
  | { readonly type: 'highlights/set'; readonly items: readonly ReaderHighlight[] }
  | { readonly type: 'highlights/error'; readonly message: string }
  | { readonly type: 'highlights/saving'; readonly saving: boolean }
  | { readonly type: 'highlights/add'; readonly item: ReaderHighlight }
  | { readonly type: 'highlights/remove'; readonly id: string }
  | { readonly type: 'panel/set'; readonly panel: ReaderPanel }
  | { readonly type: 'provider/set'; readonly status: ProviderStatus }
  | { readonly type: 'highlight-error/clear' }

function assertNever(value: never): never {
  throw new Error(`Unexpected reader action: ${JSON.stringify(value)}`)
}

export function createInitialReaderState(): ReaderState {
  return {
    file: { status: 'loading', pdfDocument: null, error: null },
    parse: { status: 'queued', graph: null, error: null },
    viewport: { currentPage: 1, zoom: READER_ZOOM.default, rotation: 0, showAllPages: false, width: 0, height: 0 },
    selection: { status: 'idle', anchor: null, context: '' },
    run: { status: 'idle', task: null, text: '', error: null },
    highlights: [],
    highlightError: null,
    savingHighlight: false,
    panel: 'info',
    providerStatus: null,
  }
}

function withRun(state: ReaderState, run: ReaderRunState): ReaderState {
  return { ...state, run }
}

function withHighlightError(state: ReaderState, message: string | null): ReaderState {
  return { ...state, highlightError: message }
}

export function readerReducer(state: ReaderState, action: ReaderAction): ReaderState {
  switch (action.type) {
    case 'reader/reset': return createInitialReaderState()
    case 'file/loading': return { ...state, file: { status: 'loading', pdfDocument: null, error: null } }
    case 'file/ready': return { ...state, file: { status: 'ready', pdfDocument: action.pdfDocument, error: null } }
    case 'file/error': return { ...state, file: { status: 'error', pdfDocument: null, error: action.message } }
    case 'parse/queued': return { ...state, parse: { status: 'queued', graph: null, error: null } }
    case 'parse/extracting': return { ...state, parse: { ...state.parse, status: 'extracting', error: null } }
    case 'parse/ready': return { ...state, parse: { status: 'ready', graph: action.graph, error: null } }
    case 'parse/page-sources': {
      const graph = state.parse.graph
      if (!graph) return state
      return {
        ...state,
        parse: {
          ...state.parse,
          graph: { ...graph, pages: graph.pages.map((page) => page.pageNumber === action.page.pageNumber ? action.page : page) },
        },
      }
    }
    case 'parse/error': return { ...state, parse: { ...state.parse, status: 'error', error: action.message } }
    case 'viewport/page': return { ...state, viewport: { ...state.viewport, currentPage: action.page } }
    case 'viewport/zoom': return { ...state, viewport: { ...state.viewport, zoom: clampReaderZoom(action.zoom) } }
    case 'viewport/toggle-all': return { ...state, viewport: { ...state.viewport, showAllPages: !state.viewport.showAllPages } }
    case 'viewport/resize': return { ...state, viewport: { ...state.viewport, width: action.width, height: action.height } }
    case 'selection/set': return { ...state, selection: { status: 'selected', anchor: action.anchor, context: action.context } }
    case 'selection/clear': return { ...state, selection: { status: 'idle', anchor: null, context: '' } }
    case 'run/checking': return withRun(state, { status: 'checking-provider', task: action.task, text: '', error: null })
    case 'run/running': return state.run.status === 'checking-provider' ? withRun(state, { ...state.run, status: 'running' }) : state
    case 'run/append': return state.run.status === 'running' ? withRun(state, { ...state.run, text: state.run.text + action.text }) : state
    case 'run/result': return state.run.status === 'running' ? withRun(state, { ...state.run, text: action.text }) : state
    case 'run/completed': return state.run.status === 'running' ? withRun(state, { ...state.run, status: 'completed' }) : state
    case 'run/cancelled': return state.run.status === 'checking-provider' || state.run.status === 'running' ? withRun(state, { ...state.run, status: 'cancelled' }) : state
    case 'run/error': return withRun(state, { ...state.run, status: 'error', error: action.message })
    case 'highlights/set': return withHighlightError({ ...state, highlights: action.items }, null)
    case 'highlights/error': return withHighlightError(state, action.message)
    case 'highlights/saving': return { ...state, savingHighlight: action.saving }
    case 'highlights/add': return withHighlightError({ ...state, highlights: [action.item, ...state.highlights.filter((item) => item.id !== action.item.id)] }, null)
    case 'highlights/remove': return withHighlightError({ ...state, highlights: state.highlights.filter((item) => item.id !== action.id) }, null)
    case 'panel/set': return { ...state, panel: action.panel }
    case 'provider/set': return { ...state, providerStatus: action.status }
    case 'highlight-error/clear': return withHighlightError(state, null)
    default: return assertNever(action)
  }
}

export function clampReaderZoom(value: number): number {
  const bounded = Math.min(READER_ZOOM.max, Math.max(READER_ZOOM.min, value))
  const rounded = Math.round(bounded / READER_ZOOM.step) * READER_ZOOM.step
  return Math.round(rounded * 10) / 10
}

export function clampReaderPage(page: number, pageCount: number): number {
  return Math.min(Math.max(1, page), Math.max(1, pageCount))
}

export function visibleReaderPages(currentPage: number, pageCount: number, showAllPages: boolean): readonly number[] {
  if (showAllPages) return Array.from({ length: Math.max(0, pageCount) }, (_, index) => index + 1)
  return pageCount > 0 ? [clampReaderPage(currentPage, pageCount)] : []
}

export type ReaderViewportRect = {
  readonly width: number
  readonly height: number
}

export function readerPageViewport(page: ReaderViewportRect, zoom: number, rotation: ReaderRotation = 0): ReaderViewportRect {
  const scaled = { width: page.width * clampReaderZoom(zoom), height: page.height * clampReaderZoom(zoom) }
  const dimensions = rotation === 90 || rotation === 270 ? { width: scaled.height, height: scaled.width } : scaled
  return { width: Math.round(dimensions.width * 1_000_000) / 1_000_000, height: Math.round(dimensions.height * 1_000_000) / 1_000_000 }
}

export function normalizedReaderRect(rect: NormRect, rotation: ReaderRotation = 0): NormRect {
  const normalized = normalizeRect(rect)
  switch (rotation) {
    case 0: return normalized
    case 90: return normalizeRect({ x: 1 - normalized.y - normalized.height, y: normalized.x, width: normalized.height, height: normalized.width })
    case 180: return normalizeRect({ x: 1 - normalized.x - normalized.width, y: 1 - normalized.y - normalized.height, width: normalized.width, height: normalized.height })
    case 270: return normalizeRect({ x: normalized.y, y: 1 - normalized.x - normalized.width, width: normalized.height, height: normalized.width })
    default: return assertNever(rotation)
  }
}
