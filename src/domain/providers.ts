const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/
const MAX_API_KEY_BYTES = 1024
const MAX_LATENCY_MS = 15 * 60_000
const MAX_ERROR_MESSAGE_LENGTH = 240

const RUNTIME_ERROR_CODES = new Set([
  'invalid_request',
  'authentication_failed',
  'rate_limited',
  'provider_unavailable',
  'provider_error',
  'provider_protocol',
  'cancelled',
  'timeout',
  'output_limit',
])

export type OpenRouterStatus =
  | Readonly<{ configured: false }>
  | Readonly<{ configured: true; modelId: string }>

export type ProviderStatus = Readonly<{
  storageConfigured: boolean
  openRouter: OpenRouterStatus
}>

export type OpenRouterTestResult = Readonly<{
  ok: true
  modelId: string
  latencyMs: number
}> | Readonly<{
  ok: false
  modelId: string
  latencyMs: number
  error: Readonly<{
    code: string
    message: string
    retryable: boolean
  }>
}>

export type DesktopProviderId = 'claude-code' | 'codex' | 'agy'

export type DesktopProviderHealth = Readonly<{
  providerId: DesktopProviderId
  status: 'healthy' | 'limited' | 'failed'
  detected: boolean
  authenticated: boolean
  checkedAt: string
}>

export type SettingsProvider = Readonly<{
  id: 'openrouter' | DesktopProviderId
  label: string
  available: boolean
}>

export type ProviderFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export type OpenRouterTestPlan =
  | Readonly<{ kind: 'candidate'; candidate: Readonly<{ apiKey: string; modelId: string }> }>
  | Readonly<{ kind: 'saved' }>
  | Readonly<{ kind: 'unconfigured' }>
  | Readonly<{ kind: 'saved-model'; modelId: string }>

export type OpenRouterTestInput =
  | Readonly<{ apiKey: string; modelId: string }>
  | Readonly<{ modelId: string }>

export class ProviderInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProviderInputError'
  }
}

export class ProviderResponseError extends Error {
  constructor(message = 'PaperBridge가 올바르지 않은 제공자 응답을 받았습니다.') {
    super(message)
    this.name = 'ProviderResponseError'
  }
}

export class ProviderRequestError extends Error {
  constructor(message = 'PaperBridge가 제공자 작업을 완료하지 못했습니다.') {
    super(message)
    this.name = 'ProviderRequestError'
  }
}

/**
 * Small, secret-safe client for the provider settings boundary. It deliberately
 * returns public configuration metadata only; callers keep a candidate key in
 * local component state for the duration of one interaction.
 */
export function createProviderClient(fetcher: ProviderFetch = fetch) {
  return {
    async getStatus(signal?: AbortSignal): Promise<ProviderStatus> {
      const response = await request(fetcher, '/api/providers', { signal })
      return parseProviderStatus(await readJson(response))
    },

    async saveOpenRouter(input: Readonly<{ apiKey: string; modelId: string }>, signal?: AbortSignal): Promise<OpenRouterStatus> {
      validateOpenRouterInput(input)
      const response = await request(fetcher, '/api/providers/openrouter', {
        method: 'PUT',
        signal,
        body: JSON.stringify({ apiKey: input.apiKey, modelId: input.modelId }),
      })
      return parseOpenRouterEnvelope(await readJson(response))
    },

    async clearOpenRouter(signal?: AbortSignal): Promise<OpenRouterStatus> {
      const response = await request(fetcher, '/api/providers/openrouter', { method: 'DELETE', signal })
      return parseOpenRouterEnvelope(await readJson(response))
    },

    async testOpenRouter(candidate?: OpenRouterTestInput, signal?: AbortSignal): Promise<OpenRouterTestResult> {
      if (candidate && 'apiKey' in candidate) validateOpenRouterInput(candidate)
      else if (candidate && !isModelId(candidate.modelId)) throw new ProviderInputError('계속하려면 올바른 모델 ID를 입력하세요.')
      const response = await request(fetcher, '/api/providers/openrouter/test', {
        method: 'POST',
        signal,
        body: JSON.stringify(candidate ?? {}),
      }, true)
      return parseOpenRouterTestEnvelope(await readJson(response))
    },
  }
}

export const providerClient = createProviderClient()

export function validateOpenRouterInput(input: Readonly<{ apiKey: string; modelId: string }>): void {
  if (!isApiKey(input.apiKey)) throw new ProviderInputError('계속하려면 올바른 OpenRouter API 키를 입력하세요.')
  if (!isModelId(input.modelId)) throw new ProviderInputError('계속하려면 올바른 모델 ID를 입력하세요.')
}

/**
 * Plans an explicit key test without ever reading a saved key in the renderer.
 * A model-only plan asks the server to combine that model with the encrypted
 * saved key. The renderer never reads or receives the credential.
 */
export function planOpenRouterTest(
  input: Readonly<{ apiKey: string; modelId: string }>,
  saved: OpenRouterStatus | null,
): OpenRouterTestPlan {
  if (input.apiKey) return { kind: 'candidate', candidate: input }
  if (saved?.configured !== true) return { kind: 'unconfigured' }
  if (input.modelId !== saved.modelId) return { kind: 'saved-model', modelId: input.modelId }
  return { kind: 'saved' }
}

/** Combines only observed configuration and desktop health; it never infers health. */
export function combineSettingsProviders(
  openRouter: OpenRouterStatus | null,
  isDesktop: boolean,
  desktopHealth: readonly DesktopProviderHealth[],
): readonly SettingsProvider[] {
  const healthById = new Map(desktopHealth.map((health) => [health.providerId, health]))
  const cliProviders: readonly SettingsProvider[] = [
    ['claude-code', 'Claude Code'],
    ['codex', 'Codex'],
    ['agy', 'Agy'],
  ].map(([id, label]) => {
    const health = healthById.get(id as DesktopProviderId)
    return {
      id: id as DesktopProviderId,
      label,
      available: Boolean(isDesktop && health?.detected && health.authenticated && health.status !== 'failed'),
    }
  })

  return [
    { id: 'openrouter', label: 'OpenRouter', available: openRouter?.configured === true },
    ...cliProviders,
  ]
}

export function selectedProviderLabel(providers: readonly SettingsProvider[]): string {
  return providers.find((provider) => provider.available)?.label ?? '선택된 제공자 없음'
}

async function request(fetcher: ProviderFetch, url: string, init: RequestInit, permitTestFailure = false): Promise<Response> {
  const response = await fetcher(url, {
    ...init,
    credentials: 'same-origin',
    headers: {
      accept: 'application/json',
      ...(init.body ? { 'content-type': 'application/json' } : {}),
    },
  })
  if (!response.ok && !permitTestFailure) throw new ProviderRequestError()
  return response
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    throw new ProviderResponseError()
  }
}

function parseProviderStatus(value: unknown): ProviderStatus {
  if (!isRecord(value) || !hasOnlyKeys(value, ['storageConfigured', 'openRouter']) || typeof value.storageConfigured !== 'boolean') {
    throw new ProviderResponseError()
  }
  return { storageConfigured: value.storageConfigured, openRouter: parseOpenRouterStatus(value.openRouter) }
}

function parseOpenRouterEnvelope(value: unknown): OpenRouterStatus {
  if (!isRecord(value) || !hasOnlyKeys(value, ['openRouter'])) throw new ProviderResponseError()
  return parseOpenRouterStatus(value.openRouter)
}

function parseOpenRouterStatus(value: unknown): OpenRouterStatus {
  if (!isRecord(value) || typeof value.configured !== 'boolean') throw new ProviderResponseError()
  if (!value.configured) {
    if (!hasOnlyKeys(value, ['configured'])) throw new ProviderResponseError()
    return { configured: false }
  }
  if (!hasOnlyKeys(value, ['configured', 'modelId']) || !isModelId(value.modelId)) throw new ProviderResponseError()
  return { configured: true, modelId: value.modelId }
}

function parseOpenRouterTestEnvelope(value: unknown): OpenRouterTestResult {
  if (!isRecord(value) || !hasOnlyKeys(value, ['openRouter'])) throw new ProviderResponseError()
  return parseOpenRouterTestResult(value.openRouter)
}

function parseOpenRouterTestResult(value: unknown): OpenRouterTestResult {
  if (!isRecord(value) || typeof value.ok !== 'boolean' || !isModelId(value.modelId) || !isLatency(value.latencyMs)) {
    throw new ProviderResponseError()
  }
  if (value.ok) {
    if (!hasOnlyKeys(value, ['ok', 'modelId', 'latencyMs'])) throw new ProviderResponseError()
    return { ok: true, modelId: value.modelId, latencyMs: value.latencyMs }
  }
  if (!hasOnlyKeys(value, ['ok', 'modelId', 'latencyMs', 'error']) || !isRuntimeError(value.error)) throw new ProviderResponseError()
  return { ok: false, modelId: value.modelId, latencyMs: value.latencyMs, error: value.error }
}

function isRuntimeError(value: unknown): value is { code: string; message: string; retryable: boolean } {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['code', 'message', 'retryable']) &&
    typeof value.code === 'string' &&
    RUNTIME_ERROR_CODES.has(value.code) &&
    typeof value.message === 'string' &&
    value.message.length > 0 &&
    value.message.length <= MAX_ERROR_MESSAGE_LENGTH &&
    !hasControlCharacters(value.message) &&
    typeof value.retryable === 'boolean'
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key))
}

function isApiKey(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && byteLength(value) <= MAX_API_KEY_BYTES && !hasControlCharacters(value)
}

function isModelId(value: unknown): value is string {
  return typeof value === 'string' && MODEL_ID.test(value)
}

function isLatency(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_LATENCY_MS
}

function hasControlCharacters(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0)
    if (codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f)) return true
  }
  return false
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength
}
