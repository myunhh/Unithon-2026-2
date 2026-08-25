import {
  normalizeRunId,
  normalizeRuntimeMetadata,
  runtimeError,
  type AgentRuntimeEvent,
  type RuntimeError,
  type RuntimeMetadata,
  type RuntimeUsage,
} from './contracts.js'
import { validateProviderApiKey } from './crypto.js'

export const OPENROUTER_CHAT_COMPLETIONS_URL = 'https://openrouter.ai/api/v1/chat/completions'

const DEFAULT_RUN_TIMEOUT_MS = 60_000
const MAX_RUN_TIMEOUT_MS = 120_000
const DEFAULT_MAX_OUTPUT_CHARS = 24_000
const MAX_OUTPUT_CHARS = 100_000
const DEFAULT_MAX_TOKENS = 1_024
const MAX_TOKENS = 16_384
const DEFAULT_TEST_TIMEOUT_MS = 5_000
const MAX_TEST_TIMEOUT_MS = 15_000
export const MAX_SSE_EVENT_BYTES = 64 * 1024
export const MAX_SSE_BUFFER_BYTES = 64 * 1024
export const MAX_SSE_RESPONSE_BYTES = 512 * 1024
export const MAX_DECODED_OUTPUT_BYTES = 256 * 1024

export type OpenRouterMessage = Readonly<{
  role: 'system' | 'user' | 'assistant'
  content: string
}>

export type OpenRouterFetchResponse = Readonly<{
  ok: boolean
  status: number
  body?: unknown
  json?: () => Promise<unknown>
}>

export type OpenRouterFetch = (
  url: string,
  init: Readonly<{
    method: 'POST'
    headers: Readonly<Record<string, string>>
    body: string
    signal: AbortSignal
  }>,
) => Promise<OpenRouterFetchResponse>

export type OpenRouterRunInput = Readonly<{
  apiKey: string
  modelId: string
  messages: readonly OpenRouterMessage[]
  /** Only safe scalar metadata is emitted; secret-looking keys are dropped. */
  metadata?: Record<string, unknown>
  runId?: string
  signal?: AbortSignal
  timeoutMs?: number
  maxOutputChars?: number
  maxTokens?: number
}>

export type OpenRouterKeyTestInput = Readonly<{
  apiKey: string
  modelId: string
  /** Bounded to 15 seconds; this call never writes provider state. */
  timeoutMs?: number
}>

export type OpenRouterKeyTestResult = Readonly<{
  ok: boolean
  modelId: string
  latencyMs: number
  error?: RuntimeError
}>

export type OpenRouterAdapterOptions = Readonly<{
  fetch: OpenRouterFetch
}>

export type SseParseLimits = Readonly<{
  maxEventBytes: number
  maxBufferedBytes: number
  maxResponseBytes: number
}>

const DEFAULT_SSE_LIMITS: SseParseLimits = {
  maxEventBytes: MAX_SSE_EVENT_BYTES,
  maxBufferedBytes: MAX_SSE_BUFFER_BYTES,
  maxResponseBytes: MAX_SSE_RESPONSE_BYTES,
}

/**
 * Stateless OpenRouter transport. Persistence belongs to ProviderStateRepository:
 * callers may test a key first, then explicitly save it only after success.
 */
export class OpenRouterAdapter {
  readonly #fetch: OpenRouterFetch

  constructor(options: OpenRouterAdapterOptions) {
    this.#fetch = options.fetch
  }

  async *stream(input: OpenRouterRunInput): AsyncGenerator<AgentRuntimeEvent> {
    const runId = normalizeRunId(input.runId)
    const modelId = safeModelId(input.modelId) ?? 'unknown'
    const metadata = providerMetadata(input.metadata, modelId)
    yield { type: 'started', runId, metadata }

    let cancellation: 'cancelled' | 'timeout' | undefined
    let controller: AbortController | undefined
    let clear: (() => void) | undefined
    let response: OpenRouterFetchResponse | undefined
    try {
      validateRunInput(input)
      const bounded = startBoundedRequest(input.signal, input.timeoutMs, DEFAULT_RUN_TIMEOUT_MS, MAX_RUN_TIMEOUT_MS)
      controller = bounded.controller
      clear = bounded.clear
      const maxOutputChars = boundedPositive(input.maxOutputChars, DEFAULT_MAX_OUTPUT_CHARS, MAX_OUTPUT_CHARS)
      const maxTokens = boundedPositive(input.maxTokens, DEFAULT_MAX_TOKENS, MAX_TOKENS)
      // A route can be cancelled while it waits for session credential storage.
      // Do not hand a pre-aborted signal to a transport: custom fetch adapters
      // may still observe that invocation even if Node's native fetch rejects it.
      if (controller.signal.aborted) {
        const outcome = abortOutcome(new Error('Provider request aborted before transport start.'), controller.signal, input.signal)
        throw new OpenRouterFailure(
          outcome === 'timeout'
            ? runtimeError('timeout', 'The provider request timed out.', true)
            : runtimeError('cancelled', 'The provider request was cancelled.', false),
        )
      }
      let receivedDone = false
      let text = ''
      let usage: RuntimeUsage | undefined
      let finishReason: string | undefined

      response = await this.#fetch(OPENROUTER_CHAT_COMPLETIONS_URL, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${input.apiKey}`,
          'content-type': 'application/json',
          accept: 'text/event-stream',
        },
        body: JSON.stringify({
          model: input.modelId,
          messages: input.messages,
          stream: true,
          max_tokens: maxTokens,
        }),
        signal: controller.signal,
      })

      if (!response.ok) throw new OpenRouterFailure(httpError(response.status))
      const chunks = toAsyncChunks(response.body)
      let decodedOutputBytes = 0
      for await (const data of parseSseData(chunks)) {
        if (data.trim() === '[DONE]') {
          receivedDone = true
          break
        }
        const chunk = parseOpenRouterChunk(data)
        if (chunk.error) throw new OpenRouterFailure(runtimeError('provider_error', 'The provider rejected the request.', false))
        if (chunk.usage) usage = chunk.usage
        if (chunk.finishReason) finishReason = chunk.finishReason
        if (chunk.delta) {
          const deltaBytes = Buffer.byteLength(chunk.delta, 'utf8')
          if (text.length + chunk.delta.length > maxOutputChars || decodedOutputBytes + deltaBytes > MAX_DECODED_OUTPUT_BYTES) {
            controller.abort('output_limit')
            void cancelBody(response.body)
            throw new OpenRouterFailure(
              runtimeError('output_limit', 'The model response reached the configured output limit.', false),
            )
          }
          text += chunk.delta
          decodedOutputBytes += deltaBytes
          yield { type: 'text-delta', runId, metadata, delta: chunk.delta }
        }
      }

      if (!receivedDone) {
        throw new OpenRouterFailure(runtimeError('provider_protocol', 'The provider ended an incomplete stream.', true))
      }
      yield { type: 'result', runId, metadata, text, ...(finishReason ? { finishReason } : {}), ...(usage ? { usage } : {}) }
      yield { type: 'done', runId, metadata, outcome: 'completed' }
    } catch (error) {
      if (error instanceof SseLimitError) {
        controller?.abort('output_limit')
        void cancelBody(response?.body)
      }
      cancellation = cancellation ?? abortOutcome(error, controller?.signal, input.signal)
      const safeError =
        error instanceof OpenRouterFailure
          ? error.runtimeError
          : error instanceof SseLimitError
            ? runtimeError('output_limit', 'The provider response exceeded the configured size limit.', false)
          : cancellation === 'timeout'
            ? runtimeError('timeout', 'The provider request timed out.', true)
            : cancellation === 'cancelled'
              ? runtimeError('cancelled', 'The provider request was cancelled.', false)
              : runtimeError('provider_unavailable', 'The provider is temporarily unavailable.', true)
      yield { type: 'error', runId, metadata, error: safeError }
      yield { type: 'done', runId, metadata, outcome: safeError.code === 'cancelled' ? 'cancelled' : 'failed' }
    } finally {
      clear?.()
    }
  }

  /**
   * Validates one candidate key with a single non-streaming, one-token request.
   * It is intentionally stateless: call repository.saveOpenRouter separately.
   */
  async testKey(input: OpenRouterKeyTestInput): Promise<OpenRouterKeyTestResult> {
    const startedAt = Date.now()
    const modelId = safeModelId(input.modelId) ?? 'unknown'
    let bounded: ReturnType<typeof startBoundedRequest> | undefined
    try {
      try {
        validateProviderApiKey(input.apiKey)
      } catch {
        throw new OpenRouterFailure(runtimeError('invalid_request', 'The provider key is invalid.', false))
      }
      if (!safeModelId(input.modelId)) throw new OpenRouterFailure(runtimeError('invalid_request', 'The provider request is invalid.', false))
      bounded = startBoundedRequest(undefined, input.timeoutMs, DEFAULT_TEST_TIMEOUT_MS, MAX_TEST_TIMEOUT_MS)
      const response = await this.#fetch(OPENROUTER_CHAT_COMPLETIONS_URL, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${input.apiKey}`,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          model: input.modelId,
          messages: [{ role: 'user', content: 'Reply with OK.' }],
          stream: false,
          max_tokens: 1,
          temperature: 0,
        }),
        signal: bounded.controller.signal,
      })
      if (!response.ok) throw new OpenRouterFailure(httpError(response.status))
      if (!response.json || !isExpectedHealthResponse(await response.json())) {
        throw new OpenRouterFailure(runtimeError('provider_protocol', 'The provider returned an invalid key-test response.', true))
      }
      return { ok: true, modelId, latencyMs: Date.now() - startedAt }
    } catch (error) {
      const cancelled = abortOutcome(error, bounded?.controller.signal)
      const safeError =
        error instanceof OpenRouterFailure
          ? error.runtimeError
          : cancelled === 'timeout'
            ? runtimeError('timeout', 'The provider key test timed out.', true)
            : runtimeError('provider_unavailable', 'The provider key test is temporarily unavailable.', true)
      return { ok: false, modelId, latencyMs: Date.now() - startedAt, error: safeError }
    } finally {
      bounded?.clear()
    }
  }
}

/** Parses SSE across arbitrary byte boundaries and combines multiline data fields. */
export async function* parseSseData(
  chunks: AsyncIterable<Uint8Array>,
  limits: SseParseLimits = DEFAULT_SSE_LIMITS,
): AsyncGenerator<string> {
  validateSseLimits(limits)
  const decoder = new TextDecoder()
  let buffered = ''
  let dataLines: string[] = []
  let eventBytes = 0
  let responseBytes = 0

  const processLine = (rawLine: string): string | undefined => {
    const line = rawLine.replace(/\r$/, '')
    if (line === '') {
      const event = dataLines.length > 0 ? dataLines.join('\n') : undefined
      dataLines = []
      eventBytes = 0
      return event
    }
    eventBytes += Buffer.byteLength(rawLine, 'utf8') + 1
    if (eventBytes > limits.maxEventBytes) throw new SseLimitError('event')
    if (line.startsWith(':')) return undefined
    const separator = line.indexOf(':')
    const field = separator === -1 ? line : line.slice(0, separator)
    const value = separator === -1 ? '' : line.slice(separator + 1).replace(/^ /, '')
    if (field === 'data') dataLines.push(value)
    return undefined
  }

  const consume = (text: string): string[] => {
    const events: string[] = []
    buffered += text
    let newline = buffered.indexOf('\n')
    while (newline !== -1) {
      const line = buffered.slice(0, newline)
      buffered = buffered.slice(newline + 1)
      const event = processLine(line)
      if (event !== undefined) events.push(event)
      newline = buffered.indexOf('\n')
    }
    if (Buffer.byteLength(buffered, 'utf8') > limits.maxBufferedBytes) throw new SseLimitError('buffer')
    return events
  }

  for await (const chunk of chunks) {
    if (!(chunk instanceof Uint8Array)) {
      throw new OpenRouterFailure(runtimeError('provider_protocol', 'The provider returned an invalid stream.', true))
    }
    responseBytes += chunk.byteLength
    if (responseBytes > limits.maxResponseBytes) throw new SseLimitError('response')
    for (const event of consume(decoder.decode(chunk, { stream: true }))) yield event
  }
  for (const event of consume(decoder.decode())) yield event
  if (buffered.length > 0) {
    const event = processLine(buffered.replace(/\r$/, ''))
    if (event !== undefined) yield event
  }
  if (dataLines.length > 0) {
    if (eventBytes > limits.maxEventBytes) throw new SseLimitError('event')
    yield dataLines.join('\n')
  }
}

class SseLimitError extends Error {
  constructor(readonly limit: 'event' | 'buffer' | 'response') {
    super('SSE response limit exceeded.')
    this.name = 'SseLimitError'
  }
}

class OpenRouterFailure extends Error {
  constructor(readonly runtimeError: RuntimeError) {
    super(runtimeError.message)
    this.name = 'OpenRouterFailure'
  }
}

function validateRunInput(input: OpenRouterRunInput): void {
  try {
    validateProviderApiKey(input.apiKey)
  } catch {
    throw new OpenRouterFailure(runtimeError('invalid_request', 'The provider request is invalid.', false))
  }
  if (!safeModelId(input.modelId) || !Array.isArray(input.messages) || input.messages.length < 1 || input.messages.length > 32) {
    throw new OpenRouterFailure(runtimeError('invalid_request', 'The provider request is invalid.', false))
  }
  for (const message of input.messages) {
    if (
      !message ||
      !['system', 'user', 'assistant'].includes(message.role) ||
      typeof message.content !== 'string' ||
      message.content.length === 0 ||
      message.content.length > 32_000
    ) {
      throw new OpenRouterFailure(runtimeError('invalid_request', 'The provider request is invalid.', false))
    }
  }
}

function safeModelId(value: unknown): string | null {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(value) ? value : null
}

function providerMetadata(input: Record<string, unknown> | undefined, modelId: string): RuntimeMetadata {
  return normalizeRuntimeMetadata({ ...input, provider: 'openrouter', modelId })
}

function boundedPositive(value: number | undefined, fallback: number, maximum: number): number {
  if (value === undefined) return fallback
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw new OpenRouterFailure(runtimeError('invalid_request', 'The provider request is invalid.', false))
  }
  return value
}

function startBoundedRequest(
  externalSignal: AbortSignal | undefined,
  requestedTimeout: number | undefined,
  fallbackTimeout: number,
  maximumTimeout: number,
): { controller: AbortController; clear: () => void } {
  const timeoutMs = boundedPositive(requestedTimeout, fallbackTimeout, maximumTimeout)
  const controller = new AbortController()
  let timedOut = false
  const timeout = setTimeout(() => {
    timedOut = true
    controller.abort('timeout')
  }, timeoutMs)
  const onExternalAbort = () => controller.abort('cancelled')
  externalSignal?.addEventListener('abort', onExternalAbort, { once: true })
  if (externalSignal?.aborted) onExternalAbort()
  return {
    controller,
    clear: () => {
      clearTimeout(timeout)
      externalSignal?.removeEventListener('abort', onExternalAbort)
      // Keep timeout classification private to this closure; AbortSignal.reason
      // is not portable across every supported Node runtime.
      void timedOut
    },
  }
}

function abortOutcome(
  error: unknown,
  requestSignal: AbortSignal | undefined,
  externalSignal?: AbortSignal,
): 'cancelled' | 'timeout' | undefined {
  if (!requestSignal?.aborted && !externalSignal?.aborted) return undefined
  if (requestSignal?.reason === 'timeout') return 'timeout'
  if (externalSignal?.aborted) return 'cancelled'
  // Some fetch implementations discard AbortSignal.reason, but an aborted
  // request without an external cancellation is necessarily our timeout.
  if (requestSignal?.aborted && error) return 'timeout'
  return 'cancelled'
}

function httpError(status: number): RuntimeError {
  if (status === 401 || status === 403) return runtimeError('authentication_failed', 'Provider authentication failed.', false)
  if (status === 408) return runtimeError('timeout', 'The provider request timed out.', true)
  if (status === 429) return runtimeError('rate_limited', 'The provider rate limit was reached.', true)
  if (status >= 500 && status <= 599) return runtimeError('provider_unavailable', 'The provider is temporarily unavailable.', true)
  return runtimeError('provider_error', 'The provider rejected the request.', false)
}

function isExpectedHealthResponse(value: unknown): boolean {
  if (!isRecord(value) || typeof value.id !== 'string' || value.id.length === 0 || !Array.isArray(value.choices)) {
    return false
  }
  const firstChoice = value.choices[0]
  return isRecord(firstChoice) && (typeof firstChoice.text === 'string' || isRecord(firstChoice.message))
}

function validateSseLimits(limits: SseParseLimits): void {
  for (const value of [limits.maxEventBytes, limits.maxBufferedBytes, limits.maxResponseBytes]) {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new OpenRouterFailure(runtimeError('provider_protocol', 'The provider stream limits are invalid.', false))
    }
  }
  if (limits.maxBufferedBytes > limits.maxResponseBytes || limits.maxEventBytes > limits.maxResponseBytes) {
    throw new OpenRouterFailure(runtimeError('provider_protocol', 'The provider stream limits are invalid.', false))
  }
}

function toAsyncChunks(body: unknown): AsyncIterable<Uint8Array> {
  if (isAsyncIterable(body)) return body
  if (isReadableStreamLike(body)) return readableStreamChunks(body)
  throw new OpenRouterFailure(runtimeError('provider_protocol', 'The provider returned an invalid stream.', true))
}

async function* readableStreamChunks(body: { getReader: () => { read: () => Promise<{ done: boolean; value?: Uint8Array }>; releaseLock?: () => void } }): AsyncGenerator<Uint8Array> {
  const reader = body.getReader()
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) return
      if (next.value) yield next.value
    }
  } finally {
    reader.releaseLock?.()
  }
}

async function cancelBody(body: unknown): Promise<void> {
  if (isRecord(body) && typeof body.cancel === 'function') {
    try {
      await body.cancel()
    } catch {
      // Cancellation is best effort. The abort signal still stops fetch.
    }
  }
}

function parseOpenRouterChunk(data: string): {
  delta?: string
  finishReason?: string
  usage?: RuntimeUsage
  error: boolean
} {
  let payload: unknown
  try {
    payload = JSON.parse(data)
  } catch {
    throw new OpenRouterFailure(runtimeError('provider_protocol', 'The provider sent an invalid stream event.', true))
  }
  if (!isRecord(payload)) throw new OpenRouterFailure(runtimeError('provider_protocol', 'The provider sent an invalid stream event.', true))
  if (payload.error !== undefined) return { error: true }

  const choice = Array.isArray(payload.choices) ? payload.choices[0] : undefined
  if (choice !== undefined && !isRecord(choice)) {
    throw new OpenRouterFailure(runtimeError('provider_protocol', 'The provider sent an invalid stream event.', true))
  }
  const delta = choice ? contentFromDelta(choice.delta) : undefined
  const finishReason = choice && typeof choice.finish_reason === 'string' && choice.finish_reason.length <= 64
    ? choice.finish_reason
    : undefined
  return { ...(delta ? { delta } : {}), ...(finishReason ? { finishReason } : {}), ...(usageFrom(payload.usage) ? { usage: usageFrom(payload.usage) } : {}), error: false }
}

function contentFromDelta(value: unknown): string | undefined {
  if (isRecord(value) && typeof value.content === 'string') return value.content
  if (isRecord(value) && Array.isArray(value.content)) {
    const text = value.content
      .filter(isRecord)
      .map((part) => (typeof part.text === 'string' ? part.text : ''))
      .join('')
    return text || undefined
  }
  return undefined
}

function usageFrom(value: unknown): RuntimeUsage | undefined {
  if (!isRecord(value)) return undefined
  const inputTokens = nonNegativeInteger(value.prompt_tokens)
  const outputTokens = nonNegativeInteger(value.completion_tokens)
  const totalTokens = nonNegativeInteger(value.total_tokens)
  return inputTokens === undefined && outputTokens === undefined && totalTokens === undefined
    ? undefined
    : { ...(inputTokens === undefined ? {} : { inputTokens }), ...(outputTokens === undefined ? {} : { outputTokens }), ...(totalTokens === undefined ? {} : { totalTokens }) }
}

function nonNegativeInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined
}

function isAsyncIterable(value: unknown): value is AsyncIterable<Uint8Array> {
  return isRecord(value) && typeof value[Symbol.asyncIterator] === 'function'
}

function isReadableStreamLike(value: unknown): value is { getReader: () => { read: () => Promise<{ done: boolean; value?: Uint8Array }>; releaseLock?: () => void } } {
  return isRecord(value) && typeof value.getReader === 'function'
}

function isRecord(value: unknown): value is Record<string | symbol, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
