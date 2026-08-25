import { randomUUID } from 'node:crypto'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ServerEnv } from './env.js'
import { createServerSupabaseClient } from './supabase.js'

export const DOCUMENT_STATE_ID_PREFIX = 'paperbridge:library:'
export const PDF_BUCKET = 'paperbridge-pdfs'
export const MAX_PDF_BYTES = 50 * 1024 * 1024
const MAX_TITLE_LENGTH = 240
const MAX_STATE_SAVE_ATTEMPTS = 4
const STORAGE_CLEANUP_ATTEMPTS = 2

export type DocumentParseState = 'queued' | 'uploading' | 'extracting' | 'structuring' | 'ready' | 'failed'

export type LibraryDocument = {
  id: string
  title: string
  originalFileName: string
  sizeBytes: number
  pageCount: number
  parseState: DocumentParseState
  createdAt: string
  updatedAt: string
}

type PersistedLibraryDocument = LibraryDocument & {
  storagePath: string
}

type LibraryState = {
  version: 1
  documents: PersistedLibraryDocument[]
}

type StateSnapshot = {
  revision: number
  state: LibraryState
}

type StateWriteResult =
  | { saved: true; revision: number }
  | { saved: false }

export type LibraryStateGateway = {
  read: () => Promise<StateSnapshot>
  write: (expectedRevision: number, state: LibraryState) => Promise<StateWriteResult>
}

export type UploadInput = {
  bytes: Buffer
  originalFileName: string
  mimeType: string
  title?: string
  /** Set only after the API has parsed the PDF in this request. */
  verifiedPageCount?: number
}

export type DocumentFile = {
  bytes: Uint8Array
  originalFileName: string
}

export interface DocumentStore {
  list(): Promise<LibraryDocument[]>
  upload(input: UploadInput): Promise<LibraryDocument>
  getFile(id: string): Promise<DocumentFile | null>
}

export class DocumentValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DocumentValidationError'
  }
}

export class DocumentStorageError extends Error {
  constructor(message = 'Document storage is temporarily unavailable.') {
    super(message)
    this.name = 'DocumentStorageError'
  }
}

export type OrphanedUpload = {
  reconciliationPath: string
  sessionId: string
  storagePath: string
}

export type StorageCleanupGateway = {
  remove(paths: string[]): Promise<{ error: unknown | null }>
  upload(
    path: string,
    data: Buffer,
    options: { contentType: string; upsert: boolean },
  ): Promise<{ error: unknown | null }>
}

function requireSessionId(sessionId: string): string {
  if (!/^[A-Za-z0-9_-]{32}$/.test(sessionId)) {
    throw new DocumentStorageError('The current library session is invalid.')
  }
  return sessionId
}

export function documentStateIdForSession(sessionId: string): string {
  return `${DOCUMENT_STATE_ID_PREFIX}${requireSessionId(sessionId)}`
}

export function storagePrefixForSession(sessionId: string): string {
  return `sessions/${requireSessionId(sessionId)}`
}

export function documentStoragePath(sessionId: string, documentId: string): string {
  return `${storagePrefixForSession(sessionId)}/documents/${documentId}.pdf`
}

function emptyLibraryState(): LibraryState {
  return { version: 1, documents: [] }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isParseState(value: unknown): value is DocumentParseState {
  return value === 'queued' || value === 'uploading' || value === 'extracting' || value === 'structuring'
    || value === 'ready' || value === 'failed'
}

function asPersistedDocument(value: unknown): PersistedLibraryDocument | null {
  if (!isRecord(value)) return null

  const { id, title, originalFileName, sizeBytes, pageCount, parseState, createdAt, updatedAt, storagePath } = value
  if (
    typeof id !== 'string' || typeof title !== 'string' || typeof originalFileName !== 'string'
    || typeof sizeBytes !== 'number' || typeof pageCount !== 'number' || !isParseState(parseState)
    || typeof createdAt !== 'string' || typeof updatedAt !== 'string' || typeof storagePath !== 'string'
  ) {
    return null
  }

  return { id, title, originalFileName, sizeBytes, pageCount, parseState, createdAt, updatedAt, storagePath }
}

function readLibraryState(value: unknown): LibraryState {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.documents)) return emptyLibraryState()

  return {
    version: 1,
    documents: value.documents.map(asPersistedDocument).filter((document): document is PersistedLibraryDocument => document !== null),
  }
}

function publicDocument(document: PersistedLibraryDocument): LibraryDocument {
  const { storagePath: _storagePath, ...metadata } = document
  return metadata
}

function stripControlCharacters(value: string): string {
  return Array.from(value, (character) => {
    const code = character.charCodeAt(0)
    return code < 32 || code === 127 ? ' ' : character
  }).join('')
}

export function sanitizeFileName(value: string): string {
  const normalized = stripControlCharacters(value).replace(/[\\/]+/g, ' ').trim()
  return normalized.slice(0, MAX_TITLE_LENGTH) || 'document.pdf'
}

export function titleFromUpload(title: string | undefined, originalFileName: string): string {
  const candidate = title ? stripControlCharacters(title).trim() : undefined
  if (candidate) return candidate.slice(0, MAX_TITLE_LENGTH)

  const fromFileName = originalFileName.replace(/\.pdf$/i, '').trim()
  return (fromFileName || 'Untitled PDF').slice(0, MAX_TITLE_LENGTH)
}

export function hasPdfMagicBytes(bytes: Uint8Array): boolean {
  return bytes.byteLength >= 5
    && bytes[0] === 0x25
    && bytes[1] === 0x50
    && bytes[2] === 0x44
    && bytes[3] === 0x46
    && bytes[4] === 0x2d
}

export async function validatePdfUpload(input: UploadInput): Promise<number> {
  if (input.mimeType.toLowerCase() !== 'application/pdf') {
    throw new DocumentValidationError('Only application/pdf uploads are accepted.')
  }
  if (input.bytes.byteLength > MAX_PDF_BYTES) {
    throw new DocumentValidationError('PDF files must be 50 MB or smaller.')
  }
  if (!hasPdfMagicBytes(input.bytes)) {
    throw new DocumentValidationError('The uploaded file does not contain PDF magic bytes.')
  }
  return parsePdfPageCount(input.bytes)
}

export async function mutateLibraryState<T>(
  gateway: LibraryStateGateway,
  mutate: (state: LibraryState) => { state: LibraryState; value: T },
): Promise<T> {
  for (let attempt = 0; attempt < MAX_STATE_SAVE_ATTEMPTS; attempt += 1) {
    const snapshot = await gateway.read()
    const result = mutate(snapshot.state)
    const write = await gateway.write(snapshot.revision, result.state)
    if (write.saved) return result.value
  }

  throw new DocumentStorageError('The library changed while saving. Please try the upload again.')
}

function isRevisionConflict(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  const description = `${error.code ?? ''} ${error.message ?? ''}`.toLowerCase()
  return description.includes('revision') || description.includes('concurrent') || description.includes('expected')
}

function valueFromRpcResult(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) return isRecord(value[0]) ? value[0] : null
  return isRecord(value) ? value : null
}

function createSupabaseStateGateway(client: SupabaseClient, stateId: string): LibraryStateGateway {
  return {
    async read() {
      const { data, error } = await client
        .from('opencowork_platform_state')
        .select('data, revision')
        .eq('id', stateId)
        .maybeSingle()

      if (error) throw new DocumentStorageError()
      if (!data) return { revision: 0, state: emptyLibraryState() }

      const revision = typeof data.revision === 'number' && Number.isSafeInteger(data.revision)
        ? data.revision
        : 0
      return { revision, state: readLibraryState(data.data) }
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

      // The shared RPC returns the new revision number. Supporting a row return
      // as well keeps this boundary compatible with older project deployments.
      if (typeof data === 'number') {
        return data > expectedRevision
          ? { saved: true, revision: data }
          : { saved: false }
      }
      if (data === true) return { saved: true, revision: expectedRevision + 1 }

      const saved = valueFromRpcResult(data)
      if (!saved) return { saved: false }
      const revision = typeof saved.revision === 'number' ? saved.revision : expectedRevision + 1
      return { saved: true, revision }
    },
  }
}

async function parsePdfPageCount(bytes: Buffer): Promise<number> {
  try {
    const task = getDocument({ data: new Uint8Array(bytes), disableWorker: true } as Parameters<typeof getDocument>[0])
    try {
      const document = await task.promise
      if (!Number.isSafeInteger(document.numPages) || document.numPages < 1) {
        throw new DocumentValidationError('The uploaded PDF does not contain readable pages.')
      }
      await document.getPage(1)
      return document.numPages
    } finally {
      await task.destroy()
    }
  } catch (error) {
    if (error instanceof DocumentValidationError) throw error
    const name = error instanceof Error ? error.name : ''
    if (name === 'PasswordException') {
      throw new DocumentValidationError('Password-protected PDFs cannot be uploaded.')
    }
    throw new DocumentValidationError('The uploaded PDF is corrupt or unreadable.')
  }
}

async function retryStorageOperation(operation: () => Promise<{ error: unknown | null }>): Promise<boolean> {
  for (let attempt = 0; attempt < STORAGE_CLEANUP_ATTEMPTS; attempt += 1) {
    try {
      if (!(await operation()).error) return true
    } catch {
      // The next bounded retry may recover a transient storage response.
    }
  }
  return false
}

/**
 * If metadata persistence fails after an object upload, first remove it. When
 * removal still fails, persist a private marker beside the session's objects
 * so a scheduled reconciliation job can safely locate the orphan.
 */
export async function reconcileOrphanedUpload(
  storage: StorageCleanupGateway,
  orphan: OrphanedUpload,
): Promise<'removed' | 'recorded' | 'unrecorded'> {
  if (await retryStorageOperation(() => storage.remove([orphan.storagePath]))) return 'removed'

  const marker = Buffer.from(JSON.stringify({
    kind: 'paperbridge-orphaned-upload',
    storagePath: orphan.storagePath,
    sessionId: orphan.sessionId,
    recordedAt: new Date().toISOString(),
  }))
  const recorded = await retryStorageOperation(() => storage.upload(orphan.reconciliationPath, marker, {
    contentType: 'application/json',
    upsert: true,
  }))
  return recorded ? 'recorded' : 'unrecorded'
}

function bucketOptions() {
  return {
    public: false,
    fileSizeLimit: MAX_PDF_BYTES,
    allowedMimeTypes: ['application/pdf'],
  }
}

export class SupabaseDocumentStore implements DocumentStore {
  private readonly stateGateway: LibraryStateGateway
  private bucketReady: Promise<void> | undefined

  private readonly sessionId: string

  constructor(private readonly client: SupabaseClient, sessionId: string) {
    this.sessionId = requireSessionId(sessionId)
    this.stateGateway = createSupabaseStateGateway(client, documentStateIdForSession(this.sessionId))
  }

  async list(): Promise<LibraryDocument[]> {
    const snapshot = await this.stateGateway.read()
    return snapshot.state.documents
      .map(publicDocument)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
  }

  async upload(input: UploadInput): Promise<LibraryDocument> {
    const pageCount = input.verifiedPageCount ?? await validatePdfUpload(input)
    await this.ensurePrivateBucket()

    const originalFileName = sanitizeFileName(input.originalFileName)
    const now = new Date().toISOString()
    const id = randomUUID()
    const storagePath = documentStoragePath(this.sessionId, id)
    const document: PersistedLibraryDocument = {
      id,
      title: titleFromUpload(input.title, originalFileName),
      originalFileName,
      sizeBytes: input.bytes.byteLength,
      pageCount,
      parseState: 'queued',
      createdAt: now,
      updatedAt: now,
      storagePath,
    }

    const { error: uploadError } = await this.client.storage
      .from(PDF_BUCKET)
      .upload(storagePath, input.bytes, { contentType: 'application/pdf', upsert: false })
    if (uploadError) throw new DocumentStorageError()

    try {
      return await mutateLibraryState(this.stateGateway, (state) => ({
        state: { ...state, documents: [document, ...state.documents] },
        value: publicDocument(document),
      }))
    } catch {
      const reconciliationPath = `${storagePrefixForSession(this.sessionId)}/reconciliation/${id}.json`
      const bucket = this.client.storage.from(PDF_BUCKET)
      const cleanup = await reconcileOrphanedUpload({
        remove: (paths) => bucket.remove(paths),
        upload: (path, data, options) => bucket.upload(path, data, options),
      }, { reconciliationPath, sessionId: this.sessionId, storagePath })

      if (cleanup === 'unrecorded') {
        console.error('PaperBridge could not remove or record an orphaned PDF object for reconciliation.')
        throw new DocumentStorageError('The upload could not be saved and needs storage cleanup. Please try again later.')
      }
      throw new DocumentStorageError(
        cleanup === 'recorded'
          ? 'The upload could not be saved. Its temporary file was queued for cleanup; please try again.'
          : 'The upload could not be saved. Please try again.',
      )
    }
  }

  async getFile(id: string): Promise<DocumentFile | null> {
    const snapshot = await this.stateGateway.read()
    const document = snapshot.state.documents.find((candidate) => candidate.id === id)
    if (!document) return null

    const { data, error } = await this.client.storage.from(PDF_BUCKET).download(document.storagePath)
    if (error || !data) throw new DocumentStorageError()
    return { bytes: new Uint8Array(await data.arrayBuffer()), originalFileName: document.originalFileName }
  }

  private async ensurePrivateBucket(): Promise<void> {
    if (!this.bucketReady) {
      this.bucketReady = this.ensurePrivateBucketOnce().catch((error: unknown) => {
        this.bucketReady = undefined
        throw error
      })
    }
    return this.bucketReady
  }

  private async ensurePrivateBucketOnce(): Promise<void> {
    const existing = await this.client.storage.getBucket(PDF_BUCKET)
    if (existing.data) {
      if (existing.data.public) {
        const { error } = await this.client.storage.updateBucket(PDF_BUCKET, bucketOptions())
        if (error) throw new DocumentStorageError()
      }
      return
    }

    const created = await this.client.storage.createBucket(PDF_BUCKET, bucketOptions())
    if (!created.error) return

    // A parallel server may have created the same private bucket. Re-read it to
    // make creation idempotent, and only suppress a genuine already-created race.
    const afterRace = await this.client.storage.getBucket(PDF_BUCKET)
    if (afterRace.data) {
      if (afterRace.data.public) {
        const { error } = await this.client.storage.updateBucket(PDF_BUCKET, bucketOptions())
        if (error) throw new DocumentStorageError()
      }
      return
    }

    throw new DocumentStorageError()
  }
}

export function createDocumentStore(environment: ServerEnv, sessionId: string): DocumentStore | null {
  const client = createServerSupabaseClient(environment)
  return client ? new SupabaseDocumentStore(client, sessionId) : null
}
