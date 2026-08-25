import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ServerEnv } from './env.js'
import { DocumentStorageError } from './documents.js'
import { createServerSupabaseClient } from './supabase.js'

export const HIGHLIGHT_STATE_ID_PREFIX = 'paperbridge:reader:highlights:'
const HIGHLIGHT_STATE_SAVE_ATTEMPTS = 4
const MAX_HIGHLIGHT_RECTS = 128
const MAX_TEXT_LENGTH = 4_000

export type HighlightRect = {
  x: number
  y: number
  width: number
  height: number
}

export type HighlightTextRange = {
  startItemId: string
  startOffset: number
  endItemId: string
  endOffset: number
}

export type HighlightAnchor = {
  pageNumber: number
  rects: HighlightRect[]
  textRange?: HighlightTextRange
  selectedText?: string
}

export type ReaderHighlight = {
  id: string
  documentId: string
  anchor: HighlightAnchor
  selectedText: string
  context: string
  createdAt: string
}

export type CreateHighlightInput = {
  anchor: HighlightAnchor
  selectedText?: string
  context?: string
}

export type HighlightState = {
  version: 1
  highlights: ReaderHighlight[]
}

type HighlightStateSnapshot = {
  revision: number
  state: HighlightState
}

type HighlightStateWriteResult = { saved: true; revision: number } | { saved: false }

export type HighlightStateGateway = {
  read(): Promise<HighlightStateSnapshot>
  write(expectedRevision: number, state: HighlightState): Promise<HighlightStateWriteResult>
}

export interface HighlightStore {
  list(): Promise<ReaderHighlight[]>
  create(input: CreateHighlightInput): Promise<ReaderHighlight>
  remove(id: string): Promise<boolean>
}

function validSessionId(value: string): boolean {
  return /^[A-Za-z0-9_-]{32}$/.test(value)
}

function validDocumentId(value: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(value)
}

function emptyState(): HighlightState {
  return { version: 1, highlights: [] }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function clampUnit(value: number): number {
  return Math.round(Math.min(1, Math.max(0, value)) * 1_000_000) / 1_000_000
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function asRect(value: unknown): HighlightRect | null {
  if (!isRecord(value)) return null
  const x = asFiniteNumber(value.x)
  const y = asFiniteNumber(value.y)
  const width = asFiniteNumber(value.width)
  const height = asFiniteNumber(value.height)
  if (x === null || y === null || width === null || height === null || width < 0 || height < 0) return null
  const left = clampUnit(x)
  const top = clampUnit(y)
  const right = clampUnit(x + width)
  const bottom = clampUnit(y + height)
  if (right <= left || bottom <= top) return null
  return { x: left, y: top, width: clampUnit(right - left), height: clampUnit(bottom - top) }
}

function asTextRange(value: unknown): HighlightTextRange | undefined {
  if (value === undefined) return undefined
  if (!isRecord(value)) return undefined
  const { startItemId, startOffset, endItemId, endOffset } = value
  if (
    typeof startItemId !== 'string' || typeof endItemId !== 'string'
    || typeof startOffset !== 'number' || typeof endOffset !== 'number'
    || !Number.isInteger(startOffset) || !Number.isInteger(endOffset)
    || startOffset < 0 || endOffset < 0
  ) return undefined
  return { startItemId, startOffset, endItemId, endOffset }
}

function cleanText(value: unknown): string {
  if (typeof value !== 'string') return ''
  return Array.from(value, (character) => {
    const code = character.charCodeAt(0)
    return code < 32 || code === 127 ? ' ' : character
  }).join('').replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT_LENGTH)
}

function asAnchor(value: unknown): HighlightAnchor | null {
  if (!isRecord(value) || typeof value.pageNumber !== 'number' || !Number.isInteger(value.pageNumber) || value.pageNumber < 1 || !Array.isArray(value.rects)) return null
  const rects = value.rects.map(asRect).filter((rect): rect is HighlightRect => rect !== null)
  if (rects.length === 0 || rects.length > MAX_HIGHLIGHT_RECTS) return null
  const textRange = asTextRange(value.textRange)
  return {
    pageNumber: value.pageNumber,
    rects,
    ...(textRange ? { textRange } : {}),
    ...(cleanText(value.selectedText) ? { selectedText: cleanText(value.selectedText) } : {}),
  }
}

function asHighlight(value: unknown): ReaderHighlight | null {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.documentId !== 'string' || typeof value.createdAt !== 'string') return null
  const anchor = asAnchor(value.anchor)
  if (!anchor || !validDocumentId(value.documentId) || !/^[0-9a-f-]{36}$/i.test(value.id)) return null
  return {
    id: value.id,
    documentId: value.documentId,
    anchor,
    selectedText: cleanText(value.selectedText),
    context: cleanText(value.context),
    createdAt: value.createdAt,
  }
}

function stateFrom(value: unknown): HighlightState {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.highlights)) return emptyState()
  return { version: 1, highlights: value.highlights.map(asHighlight).filter((highlight): highlight is ReaderHighlight => highlight !== null) }
}

function isRevisionConflict(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  return `${error.code ?? ''} ${error.message ?? ''}`.toLowerCase().match(/revision|concurrent|expected/) !== null
}

function rpcValue(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) return isRecord(value[0]) ? value[0] : null
  return isRecord(value) ? value : null
}

function createSupabaseGateway(client: SupabaseClient, stateId: string): HighlightStateGateway {
  return {
    async read() {
      const { data, error } = await client
        .from('opencowork_platform_state')
        .select('data, revision')
        .eq('id', stateId)
        .maybeSingle()
      if (error) throw new DocumentStorageError()
      if (!data) return { revision: 0, state: emptyState() }
      return { revision: typeof data.revision === 'number' && Number.isSafeInteger(data.revision) ? data.revision : 0, state: stateFrom(data.data) }
    },
    async write(expectedRevision, state) {
      const { data, error } = await client.rpc('save_opencowork_platform_state', {
        p_id: stateId,
        p_expected_revision: expectedRevision,
        p_data: state,
      })
      if (error) {
        if (isRevisionConflict(error)) return { saved: false }
        throw new DocumentStorageError()
      }
      if (typeof data === 'number') return data > expectedRevision ? { saved: true, revision: data } : { saved: false }
      if (data === true) return { saved: true, revision: expectedRevision + 1 }
      const saved = rpcValue(data)
      if (!saved) return { saved: false }
      return { saved: true, revision: typeof saved.revision === 'number' ? saved.revision : expectedRevision + 1 }
    },
  }
}

async function mutateHighlightState<T>(
  gateway: HighlightStateGateway,
  mutate: (state: HighlightState) => { state: HighlightState; value: T },
): Promise<T> {
  for (let attempt = 0; attempt < HIGHLIGHT_STATE_SAVE_ATTEMPTS; attempt += 1) {
    const snapshot = await gateway.read()
    const result = mutate(snapshot.state)
    if ((await gateway.write(snapshot.revision, result.state)).saved) return result.value
  }
  throw new DocumentStorageError('The highlights changed while saving. Please try again.')
}

export class HighlightRepository implements HighlightStore {
  constructor(private readonly gateway: HighlightStateGateway, private readonly documentId: string) {
    if (!validDocumentId(documentId)) throw new DocumentStorageError('The requested document is invalid.')
  }

  async list(): Promise<ReaderHighlight[]> {
    const { state } = await this.gateway.read()
    return state.highlights
      .filter((highlight) => highlight.documentId === this.documentId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
  }

  async create(input: CreateHighlightInput): Promise<ReaderHighlight> {
    const anchor = asAnchor(input.anchor)
    if (!anchor) throw new DocumentStorageError('The selected PDF text could not be highlighted.')
    const selectedText = cleanText(input.selectedText) || cleanText(anchor.selectedText)
    const context = cleanText(input.context)
    const highlight: ReaderHighlight = {
      id: randomUUID(),
      documentId: this.documentId,
      anchor,
      selectedText,
      context,
      createdAt: new Date().toISOString(),
    }
    return mutateHighlightState(this.gateway, (state) => ({
      state: { version: 1, highlights: [...state.highlights.filter((item) => item.id !== highlight.id), highlight] },
      value: highlight,
    }))
  }

  async remove(id: string): Promise<boolean> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return false
    return mutateHighlightState(this.gateway, (state) => {
      const exists = state.highlights.some((highlight) => highlight.documentId === this.documentId && highlight.id === id)
      return {
        state: { version: 1, highlights: state.highlights.filter((highlight) => highlight.id !== id) },
        value: exists,
      }
    })
  }
}

export function highlightStateIdForSession(sessionId: string, documentId: string): string {
  if (!validSessionId(sessionId) || !validDocumentId(documentId)) throw new DocumentStorageError('The requested highlight scope is invalid.')
  return `${HIGHLIGHT_STATE_ID_PREFIX}${sessionId}:${documentId}`
}

export function createHighlightStore(environment: ServerEnv, sessionId: string, documentId: string): HighlightStore | null {
  const client = createServerSupabaseClient(environment)
  return client ? new HighlightRepository(createSupabaseGateway(client, highlightStateIdForSession(sessionId, documentId)), documentId) : null
}
