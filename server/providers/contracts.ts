import { randomUUID } from 'node:crypto'

/** Only opaque identifiers chosen by the server may cross runtime boundaries. */
export type RuntimeMetadataValue = string
export type RuntimeMetadata = Readonly<Record<string, RuntimeMetadataValue>>

export type RuntimeUsage = Readonly<{
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
}>

export type RuntimeErrorCode =
  | 'invalid_request'
  | 'authentication_failed'
  | 'rate_limited'
  | 'provider_unavailable'
  | 'provider_error'
  | 'provider_protocol'
  | 'cancelled'
  | 'timeout'
  | 'output_limit'

export type RuntimeError = Readonly<{
  code: RuntimeErrorCode
  /** Safe, user-displayable text. Never use an upstream error body here. */
  message: string
  retryable: boolean
}>

type RuntimeEventBase = Readonly<{
  runId: string
  metadata: RuntimeMetadata
}>

export type RuntimeStartedEvent = RuntimeEventBase & Readonly<{
  type: 'started'
}>

export type RuntimeTextDeltaEvent = RuntimeEventBase & Readonly<{
  type: 'text-delta'
  delta: string
}>

export type RuntimeResultEvent = RuntimeEventBase & Readonly<{
  type: 'result'
  text: string
  finishReason?: string
  usage?: RuntimeUsage
}>

export type RuntimeErrorEvent = RuntimeEventBase & Readonly<{
  type: 'error'
  error: RuntimeError
}>

export type RuntimeDoneEvent = RuntimeEventBase & Readonly<{
  type: 'done'
  outcome: 'completed' | 'cancelled' | 'failed'
}>

/** The only event vocabulary exposed by a PaperBridge agent provider. */
export type AgentRuntimeEvent =
  | RuntimeStartedEvent
  | RuntimeTextDeltaEvent
  | RuntimeResultEvent
  | RuntimeErrorEvent
  | RuntimeDoneEvent

const DOCUMENT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/
const CALLER_RUN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const RUNTIME_RUN_ID = /^run_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Creates a server-owned run id. Callers may supply their own correlation id,
 * but adapters must validate it before re-emitting it.
 */
export function createRuntimeRunId(): string {
  return `run_${randomUUID()}`
}

export function normalizeRunId(value: string | undefined): string {
  // HTTP run routes use UUIDs directly as their active-run and cancellation
  // keys, while internal callers use the server-generated `run_<uuid>` form.
  // Preserve either validated format so emitted events stay correlatable.
  if (value && (CALLER_RUN_ID.test(value) || RUNTIME_RUN_ID.test(value))) {
    return value
  }
  return createRuntimeRunId()
}

/**
 * This is an allowlist, not a denylist: callers cannot cause arbitrary request
 * values (including credentials under unanticipated aliases) to be serialized
 * into runtime events. `provider` and `modelId` are supplied by the adapter,
 * while only a canonical PaperBridge document UUID can come from request scope.
 */
export function normalizeRuntimeMetadata(input: Record<string, unknown> | undefined): RuntimeMetadata {
  const result: Record<string, RuntimeMetadataValue> = {}
  if (!input) return result

  if (typeof input.documentId === 'string' && DOCUMENT_ID.test(input.documentId)) result.documentId = input.documentId
  if (input.provider === 'openrouter') result.provider = input.provider
  if (typeof input.modelId === 'string' && MODEL_ID.test(input.modelId)) result.modelId = input.modelId
  return result
}

export function runtimeError(
  code: RuntimeErrorCode,
  _message: string,
  retryable: boolean,
): RuntimeError {
  // The caller-provided text may have come from an upstream response or an
  // internal diagnostic. Keep this factory as the single public runtime-error
  // boundary and always choose a fixed Korean message from the stable code.
  return { code, message: runtimeErrorMessage(code), retryable }
}

export function runtimeErrorMessage(code: RuntimeErrorCode): string {
  switch (code) {
    case 'invalid_request': return '요청 형식이 올바르지 않습니다.'
    case 'authentication_failed': return '제공자 인증에 실패했습니다.'
    case 'rate_limited': return '요청이 많습니다. 잠시 후 다시 시도해 주세요.'
    case 'provider_unavailable': return '제공자를 잠시 사용할 수 없습니다.'
    case 'provider_error': return '제공자 요청을 처리하지 못했습니다.'
    case 'provider_protocol': return '제공자 응답을 확인하지 못했습니다.'
    case 'cancelled': return '요청이 취소되었습니다.'
    case 'timeout': return '요청 시간이 초과되었습니다.'
    case 'output_limit': return '응답이 허용된 크기를 초과했습니다.'
    default: return '제공자 오류가 발생했습니다.'
  }
}
