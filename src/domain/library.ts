import type { ParseState } from './types'

export type LibraryDocument = {
  id: string
  title: string
  originalFileName: string
  sizeBytes: number
  pageCount: number
  parseState: ParseState
  createdAt: string
  updatedAt: string
}

type DocumentListResponse = {
  documents: LibraryDocument[]
}

type DocumentUploadResponse = {
  document: LibraryDocument
}

type ApiErrorResponse = {
  error?: string
}

async function readApiError(response: Response): Promise<string> {
  try {
    const body = await response.json() as ApiErrorResponse
    if (typeof body.error === 'string') return '문서 요청을 처리하지 못했습니다. 입력과 로그인 상태를 확인한 뒤 다시 시도하세요.'
  } catch {
    // A generic error below is safer than rendering an unknown proxy response.
  }
  return 'PaperBridge가 문서 요청을 완료하지 못했습니다.'
}

export async function listLibraryDocuments(signal?: AbortSignal): Promise<LibraryDocument[]> {
  const response = await fetch('/api/documents', { signal, headers: { accept: 'application/json' } })
  if (!response.ok) throw new Error(await readApiError(response))

  const body = await response.json() as DocumentListResponse
  return Array.isArray(body.documents) ? body.documents : []
}

export function uploadLibraryDocument(
  file: File,
  title: string,
  onProgress: (percent: number) => void,
): Promise<LibraryDocument> {
  return new Promise((resolve, reject) => {
    const formData = new FormData()
    formData.set('file', file, file.name)
    if (title.trim()) formData.set('title', title.trim())

    const request = new XMLHttpRequest()
    request.open('POST', '/api/documents')
    request.responseType = 'json'
    request.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)))
    })
    request.addEventListener('error', () => reject(new Error('업로드 요청이 PaperBridge 서버에 도달하지 못했습니다.')))
    request.addEventListener('abort', () => reject(new Error('업로드가 취소되었습니다.')))
    request.addEventListener('load', () => {
      const body = request.response as DocumentUploadResponse & ApiErrorResponse | null
      if (request.status >= 200 && request.status < 300 && body?.document) {
        resolve(body.document)
        return
      }
      reject(new Error('PaperBridge가 이 PDF를 저장하지 못했습니다. 파일과 로그인 상태를 확인한 뒤 다시 시도하세요.'))
    })
    request.send(formData)
  })
}

export function documentFilePath(documentId: string): string {
  return `/api/documents/${encodeURIComponent(documentId)}/file`
}
