import { describe, expect, it } from 'vitest'
import {
  documentStateIdForSession,
  documentStoragePath,
  DocumentStorageError,
  DocumentValidationError,
  MAX_PDF_BYTES,
  mutateLibraryState,
  reconcileOrphanedUpload,
  sanitizeFileName,
  storagePrefixForSession,
  titleFromUpload,
  validatePdfUpload,
  type LibraryStateGateway,
  type StorageCleanupGateway,
} from './documents.js'
import { validPdfBytes } from './test-pdf.js'

const sessionId = '0123456789abcdefghijklmnopqrstuv'
const baseUpload = {
  bytes: validPdfBytes(),
  originalFileName: 'paper.pdf',
  mimeType: 'application/pdf',
}

describe('document upload validation', () => {
  it('requires the declared PDF content type, magic bytes, and a readable page', async () => {
    await expect(validatePdfUpload({ ...baseUpload, mimeType: 'text/plain' })).rejects.toThrow(DocumentValidationError)
    await expect(validatePdfUpload({ ...baseUpload, bytes: Buffer.from('not a PDF') })).rejects.toThrow('magic bytes')
    await expect(validatePdfUpload(baseUpload)).resolves.toBe(1)
  })

  it('rejects header-only and corrupt PDFs after pdfjs parsing', async () => {
    await expect(validatePdfUpload({ ...baseUpload, bytes: Buffer.from('%PDF-1.7\n') })).rejects.toThrow('corrupt or unreadable')
    await expect(validatePdfUpload({ ...baseUpload, bytes: Buffer.from('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n') })).rejects.toThrow('corrupt or unreadable')
  })

  it('enforces the 50 MB maximum before storage', async () => {
    await expect(validatePdfUpload({
      ...baseUpload,
      bytes: Buffer.alloc(MAX_PDF_BYTES + 1, 0x20),
    })).rejects.toThrow('50 MB')
  })

  it('keeps filenames and derived titles safe for metadata and downloads', () => {
    expect(sanitizeFileName('../study\u0000.pdf')).toBe('.. study .pdf')
    expect(titleFromUpload(undefined, 'study.pdf')).toBe('study')
    expect(titleFromUpload('  Custom title  ', 'study.pdf')).toBe('Custom title')
  })
})

describe('session-scoped persistence', () => {
  it('uses a separate state id and storage prefix for every opaque session', () => {
    expect(documentStateIdForSession(sessionId)).toBe(`paperbridge:library:${sessionId}`)
    expect(storagePrefixForSession(sessionId)).toBe(`sessions/${sessionId}`)
    expect(documentStoragePath(sessionId, '11111111-1111-4111-8111-111111111111'))
      .toBe(`sessions/${sessionId}/documents/11111111-1111-4111-8111-111111111111.pdf`)
  })
})

describe('optimistic library-state writes', () => {
  it('re-reads state and retries with the current revision after a conflict', async () => {
    const revisions: number[] = []
    let reads = 0
    const gateway: LibraryStateGateway = {
      read: async () => ({
        revision: reads++ === 0 ? 3 : 4,
        state: { version: 1, documents: [] },
      }),
      write: async (expectedRevision) => {
        revisions.push(expectedRevision)
        return expectedRevision === 3 ? { saved: false } : { saved: true, revision: 5 }
      },
    }

    const value = await mutateLibraryState(gateway, (state) => ({ state, value: 'saved' }))
    expect(value).toBe('saved')
    expect(revisions).toEqual([3, 4])
  })

  it('returns a storage error when repeated revision conflicts cannot be resolved', async () => {
    const gateway: LibraryStateGateway = {
      read: async () => ({ revision: 1, state: { version: 1, documents: [] } }),
      write: async () => ({ saved: false }),
    }
    await expect(mutateLibraryState(gateway, (state) => ({ state, value: 'never' }))).rejects.toThrow(DocumentStorageError)
  })
})

describe('orphaned upload reconciliation', () => {
  const orphan = {
    sessionId,
    storagePath: `sessions/${sessionId}/documents/paper.pdf`,
    reconciliationPath: `sessions/${sessionId}/reconciliation/paper.json`,
  }

  it('records a private recovery marker when cleanup fails after bounded retries', async () => {
    const operations: string[] = []
    const storage: StorageCleanupGateway = {
      remove: async () => {
        operations.push('remove')
        return { error: new Error('temporary storage failure') }
      },
      upload: async (path, marker) => {
        operations.push(`record:${path}`)
        expect(JSON.parse(marker.toString())).toMatchObject({ kind: 'paperbridge-orphaned-upload', storagePath: orphan.storagePath })
        return { error: null }
      },
    }

    await expect(reconcileOrphanedUpload(storage, orphan)).resolves.toBe('recorded')
    expect(operations).toEqual(['remove', 'remove', `record:${orphan.reconciliationPath}`])
  })

  it('reports an unrecorded cleanup failure instead of silently swallowing it', async () => {
    const storage: StorageCleanupGateway = {
      remove: async () => ({ error: new Error('remove failed') }),
      upload: async () => ({ error: new Error('marker failed') }),
    }
    await expect(reconcileOrphanedUpload(storage, orphan)).resolves.toBe('unrecorded')
  })
})
