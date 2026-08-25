import type { SelectionAnchor } from './types'

export type ReaderHighlight = {
  id: string
  documentId: string
  anchor: SelectionAnchor
  selectedText: string
  context: string
  createdAt: string
}

type HighlightListResponse = { highlights?: ReaderHighlight[] }
type HighlightResponse = { highlight?: ReaderHighlight }
type ErrorResponse = { error?: string }

export type DestroyablePdfResource = {
  destroy(): Promise<unknown> | unknown
}

function destroyQuietly(resource: DestroyablePdfResource | undefined) {
  if (!resource) return
  void Promise.resolve(resource.destroy()).catch(() => undefined)
}

/**
 * Owns a loading task across an async Reader effect. Registering a task after
 * unmount destroys it immediately, which closes the fetch-to-pdfjs race.
 */
export class PdfLoadLifecycle {
  private disposed = false
  private resource: DestroyablePdfResource | undefined

  get isActive(): boolean {
    return !this.disposed
  }

  attach(resource: DestroyablePdfResource): boolean {
    if (this.disposed) {
      destroyQuietly(resource)
      return false
    }
    this.resource = resource
    return true
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    const resource = this.resource
    this.resource = undefined
    destroyQuietly(resource)
  }
}

async function errorFrom(response: Response): Promise<string> {
  try {
    const body = await response.json() as ErrorResponse
    if (typeof body.error === 'string') return '하이라이트 요청을 처리하지 못했습니다. 문서 접근 권한을 확인한 뒤 다시 시도하세요.'
  } catch {
    // The server intentionally exposes only a safe generic error otherwise.
  }
  return 'PaperBridge가 이 하이라이트를 변경하지 못했습니다.'
}

export async function listReaderHighlights(documentId: string, signal?: AbortSignal): Promise<ReaderHighlight[]> {
  const response = await fetch(`/api/documents/${encodeURIComponent(documentId)}/highlights`, {
    signal,
    credentials: 'same-origin',
    headers: { accept: 'application/json' },
  })
  if (!response.ok) throw new Error(await errorFrom(response))
  const body = await response.json() as HighlightListResponse
  return Array.isArray(body.highlights) ? body.highlights : []
}

export async function createReaderHighlight(
  documentId: string,
  input: { anchor: SelectionAnchor; selectedText: string; context: string },
): Promise<ReaderHighlight> {
  const response = await fetch(`/api/documents/${encodeURIComponent(documentId)}/highlights`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(input),
  })
  if (!response.ok) throw new Error(await errorFrom(response))
  const body = await response.json() as HighlightResponse
  if (!body.highlight) throw new Error('PaperBridge가 저장된 하이라이트를 반환하지 않았습니다.')
  return body.highlight
}

export async function removeReaderHighlight(documentId: string, highlightId: string): Promise<void> {
  const response = await fetch(`/api/documents/${encodeURIComponent(documentId)}/highlights/${encodeURIComponent(highlightId)}`, {
    method: 'DELETE',
    credentials: 'same-origin',
  })
  if (!response.ok) throw new Error(await errorFrom(response))
}
