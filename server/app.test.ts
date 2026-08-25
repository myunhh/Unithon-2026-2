import { once } from 'node:events'
import { request as requestHttp } from 'node:http'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it } from 'vitest'
import { createApiServer, type DocumentStoreFactory } from './app.js'
import { MAX_PDF_BYTES, type DocumentStore, type LibraryDocument, type UploadInput } from './documents.js'
import { loadServerEnv } from './env.js'
import type { CreateHighlightInput, HighlightStore, ReaderHighlight } from './highlights.js'
import { validPdfBytes } from './test-pdf.js'

const uploadedDocument: LibraryDocument = {
  id: '11111111-1111-4111-8111-111111111111',
  title: 'Test paper',
  originalFileName: 'test-paper.pdf',
  sizeBytes: validPdfBytes().byteLength,
  pageCount: 1,
  parseState: 'queued',
  createdAt: '2026-08-25T00:00:00.000Z',
  updatedAt: '2026-08-25T00:00:00.000Z',
}

function createDocumentStore(): DocumentStore & { uploads: UploadInput[] } {
  const uploads: UploadInput[] = []
  return {
    uploads,
    list: async () => [uploadedDocument],
    upload: async (input) => {
      uploads.push(input)
      return uploadedDocument
    },
    getFile: async (id) => id === uploadedDocument.id
      ? { bytes: validPdfBytes(), originalFileName: uploadedDocument.originalFileName }
      : null,
  }
}

function createSessionStores(): DocumentStoreFactory {
  const records = new Map<string, LibraryDocument[]>()
  const sourceBytes = new Map<string, Buffer>()
  return (sessionId) => ({
    list: async () => records.get(sessionId) ?? [],
    upload: async (input) => {
      const document = {
        ...uploadedDocument,
        title: input.title || uploadedDocument.title,
        sizeBytes: input.bytes.byteLength,
        pageCount: input.verifiedPageCount ?? 0,
      }
      records.set(sessionId, [document])
      sourceBytes.set(`${sessionId}:${document.id}`, Buffer.from(input.bytes))
      return document
    },
    getFile: async (id) => records.get(sessionId)?.some((document) => document.id === id)
      ? { bytes: sourceBytes.get(`${sessionId}:${id}`) ?? Buffer.alloc(0), originalFileName: uploadedDocument.originalFileName }
      : null,
  })
}

function createHighlightStore(): HighlightStore {
  const highlights: ReaderHighlight[] = []
  return {
    list: async () => highlights,
    create: async (input: CreateHighlightInput) => {
      const highlight: ReaderHighlight = {
        id: '22222222-2222-4222-8222-222222222222',
        documentId: uploadedDocument.id,
        anchor: input.anchor,
        selectedText: input.selectedText ?? input.anchor.selectedText ?? '',
        context: input.context ?? '',
        createdAt: '2026-08-25T00:00:00.000Z',
      }
      highlights.splice(0, highlights.length, highlight)
      return highlight
    },
    remove: async (id) => {
      const index = highlights.findIndex((highlight) => highlight.id === id)
      if (index < 0) return false
      highlights.splice(index, 1)
      return true
    },
  }
}

async function startServer(
  options: Parameters<typeof createApiServer>[1] = {},
  appOrigins = 'http://127.0.0.1:5173',
  maxPdfBytes?: number,
) {
  const environment = loadServerEnv({
    APP_ORIGINS: appOrigins,
    PAPERBRIDGE_SESSION_SECRET: 'deterministic-test-session-secret',
    ...(maxPdfBytes === undefined ? {} : { PAPERBRIDGE_MAX_PDF_BYTES: String(maxPdfBytes) }),
  })
  const server = createApiServer(environment, options)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Expected a TCP server address.')
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: async () => {
      server.close()
      await once(server, 'close')
    },
  }
}

function cookieFrom(response: Response): string {
  const cookie = response.headers.get('set-cookie')
  if (!cookie) throw new Error('Expected a session cookie.')
  return cookie.split(';', 1)[0]
}

function pdfForm(title = 'My PDF'): FormData {
  const form = new FormData()
  form.set('title', title)
  form.set('file', new Blob([validPdfBytes()], { type: 'application/pdf' }), 'test-paper.pdf')
  return form
}

function oversizedContentLengthPost(origin: string): Promise<number> {
  const url = new URL(origin)
  return new Promise((resolvePost, rejectPost) => {
    const request = requestHttp({
      hostname: url.hostname,
      port: url.port,
      method: 'POST',
      path: '/api/documents',
      headers: {
        'content-type': 'multipart/form-data; boundary=paperbridge-test',
        'content-length': String(MAX_PDF_BYTES + 64 * 1024 + 1),
        origin: 'http://127.0.0.1:5173',
      },
    }, (response) => {
      response.resume()
      response.on('end', () => resolvePost(response.statusCode ?? 0))
    })
    request.once('error', rejectPost)
    request.end()
  })
}

describe('PaperBridge API', () => {
  it('returns a secret-free health response with strict same-origin CORS', async () => {
    const server = await startServer({ documents: createDocumentStore() })
    try {
      const response = await fetch(`${server.origin}/api/health`, { headers: { origin: 'http://127.0.0.1:5173' } })
      expect(response.status).toBe(200)
      expect(response.headers.get('access-control-allow-origin')).toBe('http://127.0.0.1:5173')
      expect(response.headers.get('access-control-allow-credentials')).toBe('true')
      expect(await response.json()).toEqual({ name: 'PaperBridge API', status: 'ok', supabaseConfigured: false })

      const forbidden = await fetch(`${server.origin}/api/health`, { headers: { origin: 'https://example.com' } })
      expect(forbidden.status).toBe(403)
      expect(forbidden.headers.get('set-cookie')).toBeNull()
      expect(await forbidden.json()).toEqual({ error: '이 요청은 허용되지 않습니다.' })

      const originlessWrite = await fetch(`${server.origin}/api/documents`, { method: 'POST', body: pdfForm() })
      expect(originlessWrite.status).toBe(403)
    } finally {
      await server.close()
    }
  })

  it('allows every configured CORS origin and rejects an unlisted origin', async () => {
    const secondaryOrigin = 'https://desktop.example.test'
    const server = await startServer({ documents: createDocumentStore() }, `http://127.0.0.1:5173,${secondaryOrigin}`)
    try {
      const allowed = await fetch(`${server.origin}/api/health`, { headers: { origin: secondaryOrigin } })
      expect(allowed.status).toBe(200)
      expect(allowed.headers.get('access-control-allow-origin')).toBe(secondaryOrigin)

      const forbidden = await fetch(`${server.origin}/api/health`, { headers: { origin: 'https://example.com' } })
      expect(forbidden.status).toBe(403)
    } finally {
      await server.close()
    }
  })

  it('issues a signed HTTP-only strict session cookie and does not replace a valid one', async () => {
    const server = await startServer({ documents: createDocumentStore() })
    try {
      const first = await fetch(`${server.origin}/api/health`)
      const cookie = cookieFrom(first)
      expect(first.headers.get('set-cookie')).toContain('HttpOnly')
      expect(first.headers.get('set-cookie')).toContain('SameSite=Strict')
      expect(first.headers.get('set-cookie')).not.toContain('Secure')

      const second = await fetch(`${server.origin}/api/health`, { headers: { cookie } })
      expect(second.status).toBe(200)
      expect(second.headers.get('set-cookie')).toBeNull()

      const tampered = await fetch(`${server.origin}/api/health`, { headers: { cookie: `${cookie}tampered` } })
      expect(tampered.headers.get('set-cookie')).toContain('paperbridge_session=')
    } finally {
      await server.close()
    }
  })

  it('uploads a fixture PDF, reads its stored bytes end-to-end, and isolates sessions', async () => {
    const server = await startServer({ documentStoreForSession: createSessionStores() })
    try {
      const firstCookie = cookieFrom(await fetch(`${server.origin}/api/health`))
      const secondCookie = cookieFrom(await fetch(`${server.origin}/api/health`))
      const upload = await fetch(`${server.origin}/api/documents`, {
        method: 'POST',
        headers: { cookie: firstCookie, origin: 'http://127.0.0.1:5173' },
        body: pdfForm(),
      })
      expect(upload.status).toBe(201)

      const firstList = await fetch(`${server.origin}/api/documents`, { headers: { cookie: firstCookie } })
      expect(await firstList.json()).toMatchObject({ documents: [{ id: uploadedDocument.id }] })
      const secondList = await fetch(`${server.origin}/api/documents`, { headers: { cookie: secondCookie } })
      expect(await secondList.json()).toEqual({ documents: [] })

      const inaccessible = await fetch(`${server.origin}/api/documents/${uploadedDocument.id}/file`, { headers: { cookie: secondCookie } })
      expect(inaccessible.status).toBe(404)
      const owned = await fetch(`${server.origin}/api/documents/${uploadedDocument.id}/file`, { headers: { cookie: firstCookie } })
      expect(owned.status).toBe(200)
      expect(owned.headers.get('content-type')).toBe('application/pdf')
      const uploadedBytes = new Uint8Array(await owned.arrayBuffer())
      const parsed = getDocument({ data: uploadedBytes, disableWorker: true } as Parameters<typeof getDocument>[0])
      const parsedDocument = await parsed.promise
      const content = await (await parsedDocument.getPage(1)).getTextContent()
      expect(content.items.some((item) => 'str' in item && typeof item.str === 'string' && item.str.includes('PaperBridge fixture PDF'))).toBe(true)
      await parsed.destroy()
    } finally {
      await server.close()
    }
  })

  it('rejects corrupt PDFs and multipart field/file limit violations', async () => {
    const server = await startServer({ documents: createDocumentStore() })
    try {
      const corrupt = new FormData()
      corrupt.set('file', new Blob([Buffer.from('%PDF-1.7\n')], { type: 'application/pdf' }), 'corrupt.pdf')
      const corruptResponse = await fetch(`${server.origin}/api/documents`, {
        method: 'POST',
        headers: { origin: 'http://127.0.0.1:5173' },
        body: corrupt,
      })
      expect(corruptResponse.status).toBe(415)
      const corruptBody = await corruptResponse.json() as { error: string }
      expect(corruptBody.error).toMatch(/[가-힣]/)
      expect(corruptBody.error).not.toContain('corrupt')

      const duplicateTitle = pdfForm()
      duplicateTitle.append('title', 'Duplicate')
      expect((await fetch(`${server.origin}/api/documents`, { method: 'POST', headers: { origin: 'http://127.0.0.1:5173' }, body: duplicateTitle })).status).toBe(400)

      const duplicateFile = pdfForm()
      duplicateFile.append('file', new Blob([validPdfBytes()], { type: 'application/pdf' }), 'another.pdf')
      expect((await fetch(`${server.origin}/api/documents`, { method: 'POST', headers: { origin: 'http://127.0.0.1:5173' }, body: duplicateFile })).status).toBe(400)

      const unsupported = pdfForm()
      unsupported.set('unexpected', 'value')
      expect((await fetch(`${server.origin}/api/documents`, { method: 'POST', headers: { origin: 'http://127.0.0.1:5173' }, body: unsupported })).status).toBe(400)
    } finally {
      await server.close()
    }
  })

  it('rejects an oversized multipart Content-Length before reading the body', async () => {
    const server = await startServer({ documents: createDocumentStore() })
    try {
      await expect(oversizedContentLengthPost(server.origin)).resolves.toBe(413)
    } finally {
      await server.close()
    }
  })

  it('enforces the configured PDF maximum at the API boundary', async () => {
    const documents = createDocumentStore()
    const server = await startServer({ documents }, 'http://127.0.0.1:5173', 1)
    try {
      const response = await fetch(`${server.origin}/api/documents`, {
        method: 'POST',
        headers: { origin: 'http://127.0.0.1:5173' },
        body: pdfForm(),
      })
      expect(response.status).toBe(413)
      expect(documents.uploads).toHaveLength(0)
    } finally {
      await server.close()
    }
  })

  it('persists document-owned manual highlights through the private API boundary', async () => {
    const server = await startServer({ documents: createDocumentStore(), highlights: createHighlightStore() })
    try {
      const create = await fetch(`${server.origin}/api/documents/${uploadedDocument.id}/highlights`, {
        method: 'POST',
        headers: { origin: 'http://127.0.0.1:5173', 'content-type': 'application/json' },
        body: JSON.stringify({
          anchor: { pageNumber: 1, rects: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.05 }], selectedText: 'Selected text' },
          context: 'Nearby context',
        }),
      })
      expect(create.status).toBe(201)
      expect(await create.json()).toMatchObject({ highlight: { documentId: uploadedDocument.id, selectedText: 'Selected text' } })

      const list = await fetch(`${server.origin}/api/documents/${uploadedDocument.id}/highlights`)
      expect(await list.json()).toMatchObject({ highlights: [{ id: '22222222-2222-4222-8222-222222222222' }] })
      const remove = await fetch(`${server.origin}/api/documents/${uploadedDocument.id}/highlights/22222222-2222-4222-8222-222222222222`, {
        method: 'DELETE',
        headers: { origin: 'http://127.0.0.1:5173' },
      })
      expect(remove.status).toBe(204)
    } finally {
      await server.close()
    }
  })

  it('serves the production SPA for internal routes while keeping API routes active', async () => {
    const server = await startServer({ documents: createDocumentStore(), staticRoot: process.cwd() })
    try {
      const route = await fetch(`${server.origin}/reader/${uploadedDocument.id}`, { headers: { accept: 'text/html' } })
      expect(route.status).toBe(200)
      expect(route.headers.get('content-type')).toContain('text/html')
      expect(await route.text()).toContain('<title>PaperBridge</title>')

      const missingAsset = await fetch(`${server.origin}/missing.js`)
      expect(missingAsset.status).toBe(404)
      const api = await fetch(`${server.origin}/api/health`)
      expect(api.status).toBe(200)
    } finally {
      await server.close()
    }
  })
})
