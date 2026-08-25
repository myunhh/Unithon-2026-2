import {
  ProviderCredentialCipher,
  ProviderCredentialCryptoError,
  type EncryptedProviderKeyEnvelope,
  validateProviderApiKey,
} from './crypto.js'

const STATE_PREFIX = 'paperbridge:providers:'
const DEFAULT_MAX_OPTIMISTIC_RETRIES = 3
const MAX_OPTIMISTIC_RETRIES = 5

export type OptimisticStateRecord = Readonly<{
  revision: string
  value: unknown
}>

/**
 * Adapter seam for a versioned server-side state store (for example, a
 * Supabase row guarded by an update `where revision = ...` predicate).
 */
export interface OptimisticStateGateway {
  read(stateId: string): Promise<OptimisticStateRecord | null>
  compareAndSet(
    stateId: string,
    expectedRevision: string | null,
    value: unknown,
  ): Promise<OptimisticStateRecord | null>
}

export type OpenRouterPreferences = Readonly<{
  modelId: string
}>

export type SessionProviderState = Readonly<{
  openRouter: (OpenRouterPreferences & Readonly<{ configured: true }>) | null
}>

type StoredProviderState = Readonly<{
  v: 1
  openRouter?: Readonly<{
    apiKey: EncryptedProviderKeyEnvelope
    modelId: string
  }>
}>

export class ProviderStateError extends Error {
  constructor(
    readonly code: 'invalid_state' | 'conflict' | 'storage_error' | 'unreadable_credential',
    message: string,
  ) {
    super(message)
    this.name = 'ProviderStateError'
  }

  toJSON() {
    return { code: this.code, message: this.message }
  }
}

/**
 * This object intentionally has no API-key property. It can only hand the key
 * to a short-lived callback and serializes to public configuration metadata.
 */
export class OpenRouterCredential {
  readonly #apiKey: string
  readonly modelId: string

  constructor(apiKey: string, modelId: string) {
    this.#apiKey = apiKey
    this.modelId = modelId
  }

  useApiKey<T>(operation: (apiKey: string) => T): T {
    return operation(this.#apiKey)
  }

  toJSON() {
    return { configured: true, modelId: this.modelId }
  }
}

export type ProviderStateRepositoryOptions = Readonly<{
  gateway: OptimisticStateGateway
  cipher: ProviderCredentialCipher
  maxOptimisticRetries?: number
}>

export class ProviderStateRepository {
  readonly #gateway: OptimisticStateGateway
  readonly #cipher: ProviderCredentialCipher
  readonly #maxOptimisticRetries: number

  constructor(options: ProviderStateRepositoryOptions) {
    this.#gateway = options.gateway
    this.#cipher = options.cipher
    this.#maxOptimisticRetries = validateRetryCount(options.maxOptimisticRetries)
  }

  async load(sessionId: string): Promise<SessionProviderState> {
    const record = await this.readRecord(stateIdForSession(sessionId))
    const state = record ? parseStoredProviderState(record.value) : emptyState()
    return publicState(state)
  }

  async saveOpenRouter(
    sessionId: string,
    input: Readonly<{ apiKey: string; modelId: string }>,
  ): Promise<SessionProviderState> {
    assertProviderSessionId(sessionId)
    validateProviderApiKey(input.apiKey)
    const modelId = validateModelId(input.modelId)
    const stateId = stateIdForSession(sessionId)

    return this.#writeWithRetry(stateId, () => ({
      v: 1,
      openRouter: {
        apiKey: this.#cipher.encrypt(sessionId, input.apiKey),
        modelId,
      },
    }))
  }

  async setOpenRouterPreferences(sessionId: string, preferences: OpenRouterPreferences): Promise<SessionProviderState> {
    assertProviderSessionId(sessionId)
    const modelId = validateModelId(preferences.modelId)
    const stateId = stateIdForSession(sessionId)
    return this.#writeWithRetry(stateId, (current) => {
      if (!current.openRouter) {
        throw new ProviderStateError('invalid_state', 'An OpenRouter key must be saved before selecting a model.')
      }
      return {
        v: 1,
        openRouter: { apiKey: current.openRouter.apiKey, modelId },
      }
    })
  }

  async clearOpenRouter(sessionId: string): Promise<SessionProviderState> {
    assertProviderSessionId(sessionId)
    return this.#writeWithRetry(stateIdForSession(sessionId), () => emptyState())
  }

  async withOpenRouterCredential<T>(
    sessionId: string,
    operation: (credential: OpenRouterCredential) => Promise<T> | T,
  ): Promise<T | null> {
    const record = await this.readRecord(stateIdForSession(sessionId))
    const state = record ? parseStoredProviderState(record.value) : emptyState()
    if (!state.openRouter) return null

    try {
      const apiKey = this.#cipher.decrypt(sessionId, state.openRouter.apiKey)
      return await operation(new OpenRouterCredential(apiKey, state.openRouter.modelId))
    } catch (error) {
      if (error instanceof ProviderCredentialCryptoError) {
        throw new ProviderStateError('unreadable_credential', 'Saved provider credentials cannot be read.')
      }
      throw error
    }
  }

  async #writeWithRetry(
    stateId: string,
    makeNext: (current: StoredProviderState) => StoredProviderState,
  ): Promise<SessionProviderState> {
    for (let attempt = 0; attempt < this.#maxOptimisticRetries; attempt += 1) {
      const currentRecord = await this.readRecord(stateId)
      const current = currentRecord ? parseStoredProviderState(currentRecord.value) : emptyState()
      const next = makeNext(current)
      const written = await this.compareAndSet(stateId, currentRecord?.revision ?? null, next)
      if (written) return publicState(parseStoredProviderState(written.value))
    }
    throw new ProviderStateError('conflict', 'Provider settings changed concurrently. Please retry.')
  }

  async readRecord(stateId: string): Promise<OptimisticStateRecord | null> {
    try {
      const record = await this.#gateway.read(stateId)
      if (record && !validRevision(record.revision)) {
        throw new ProviderStateError('invalid_state', 'Provider settings cannot be read.')
      }
      return record
    } catch (error) {
      if (error instanceof ProviderStateError) throw error
      throw new ProviderStateError('storage_error', 'Provider settings are temporarily unavailable.')
    }
  }

  async compareAndSet(
    stateId: string,
    expectedRevision: string | null,
    state: StoredProviderState,
  ): Promise<OptimisticStateRecord | null> {
    try {
      const record = await this.#gateway.compareAndSet(stateId, expectedRevision, state)
      if (record && !validRevision(record.revision)) {
        throw new ProviderStateError('invalid_state', 'Provider settings cannot be saved.')
      }
      return record
    } catch (error) {
      if (error instanceof ProviderStateError) throw error
      throw new ProviderStateError('storage_error', 'Provider settings are temporarily unavailable.')
    }
  }
}

export function stateIdForSession(sessionId: string): string {
  assertProviderSessionId(sessionId)
  return `${STATE_PREFIX}${sessionId}`
}

function emptyState(): StoredProviderState {
  return { v: 1 }
}

function publicState(state: StoredProviderState): SessionProviderState {
  return {
    openRouter: state.openRouter ? { configured: true, modelId: state.openRouter.modelId } : null,
  }
}

function parseStoredProviderState(value: unknown): StoredProviderState {
  if (!isRecord(value) || value.v !== 1 || Object.keys(value).some((key) => key !== 'v' && key !== 'openRouter')) {
    throw new ProviderStateError('invalid_state', 'Provider settings cannot be read.')
  }
  if (value.openRouter === undefined) return emptyState()
  if (!isRecord(value.openRouter) || Object.keys(value.openRouter).some((key) => key !== 'apiKey' && key !== 'modelId')) {
    throw new ProviderStateError('invalid_state', 'Provider settings cannot be read.')
  }
  try {
    return {
      v: 1,
      openRouter: {
        apiKey: parseEnvelopeForStorage(value.openRouter.apiKey),
        modelId: validateModelId(value.openRouter.modelId),
      },
    }
  } catch (error) {
    if (error instanceof ProviderStateError) throw error
    throw new ProviderStateError('invalid_state', 'Provider settings cannot be read.')
  }
}

function parseEnvelopeForStorage(value: unknown): EncryptedProviderKeyEnvelope {
  if (!isRecord(value) || value.v !== 1 || value.alg !== 'A256GCM') {
    throw new ProviderStateError('invalid_state', 'Provider settings cannot be read.')
  }
  if (
    Object.keys(value).some((key) => key !== 'v' && key !== 'alg' && key !== 'iv' && key !== 'ciphertext' && key !== 'tag') ||
    !isBase64Url(value.iv, 16) ||
    !isBase64Url(value.ciphertext) ||
    !isBase64Url(value.tag, 22)
  ) {
    throw new ProviderStateError('invalid_state', 'Provider settings cannot be read.')
  }
  return {
    v: 1,
    alg: 'A256GCM',
    iv: value.iv,
    ciphertext: value.ciphertext,
    tag: value.tag,
  }
}

function validateModelId(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(value)) {
    throw new ProviderStateError('invalid_state', 'The provider model id is invalid.')
  }
  return value
}

function assertProviderSessionId(sessionId: string): void {
  if (typeof sessionId !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(sessionId)) {
    throw new ProviderStateError('invalid_state', 'The provider session is invalid.')
  }
}

function validateRetryCount(value: number | undefined): number {
  if (value === undefined) return DEFAULT_MAX_OPTIMISTIC_RETRIES
  if (!Number.isInteger(value) || value < 1 || value > MAX_OPTIMISTIC_RETRIES) {
    throw new ProviderStateError('invalid_state', 'The provider retry configuration is invalid.')
  }
  return value
}

function validRevision(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 256
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isBase64Url(value: unknown, exactLength?: number): value is string {
  return (
    typeof value === 'string' &&
    (exactLength === undefined ? value.length > 0 && value.length <= 1366 : value.length === exactLength) &&
    /^[A-Za-z0-9_-]+$/.test(value)
  )
}
