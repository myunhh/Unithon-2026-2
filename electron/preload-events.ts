import type { DesktopAgentEvent } from './ipc.js'
import { agentRuntimeErrorMessage, type AgentRuntimeErrorCode } from './agent-runtime/contracts.js'

const providerIds = new Set(['claude-code', 'codex', 'agy'])
const eventTypes = new Set(['started', 'text-delta', 'result', 'error', 'done'])
const errorCodes = new Set([
  'executable-not-found',
  'provider-unavailable',
  'authentication-unavailable',
  'process-start-failed',
  'process-timeout',
  'process-cancelled',
  'process-output-limit',
  'process-exited',
  'malformed-stream-event',
  'provider-result-error',
  'provider-nonterminal-result',
])
const metadataKeys = new Set([
  'executable',
  'session_id',
  'model',
  'subtype',
  'is_error',
  'thread_id',
  'turn_id',
  'status',
  'conversation_id',
  'duration_seconds',
  'num_turns',
  'agent',
  'permission_mode',
  'state',
  'step_index',
])
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const maxTextCharacters = 2 * 1024 * 1024
const maxMetadataStringCharacters = 256
const maxErrorMessageCharacters = 512

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key))
}

function isOccurredAt(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 32) return false
  const milliseconds = Date.parse(value)
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value
}

function isBoundedText(value: unknown, maximumCharacters: number): value is string {
  return typeof value === 'string' && value.length <= maximumCharacters
}

function isMetadata(value: unknown): boolean {
  if (!isRecord(value) || !hasOnlyKeys(value, [...metadataKeys])) return false
  return Object.entries(value).every(([key, item]) => {
    if (!metadataKeys.has(key)) return false
    if (typeof item === 'string') return item.length <= maxMetadataStringCharacters
    if (typeof item === 'number') return Number.isFinite(item) && Math.abs(item) <= 1_000_000_000
    return typeof item === 'boolean' || item === null
  })
}

function isBaseEvent(value: Record<string, unknown>): boolean {
  return (
    typeof value.type === 'string' && eventTypes.has(value.type) &&
    typeof value.runId === 'string' && uuidPattern.test(value.runId) &&
    typeof value.providerId === 'string' && providerIds.has(value.providerId) &&
    isOccurredAt(value.occurredAt) &&
    typeof value.retryable === 'boolean' &&
    isMetadata(value.metadata)
  )
}

function isError(value: unknown, retryable: boolean): boolean {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['code', 'message', 'retryable']) &&
    typeof value.code === 'string' && errorCodes.has(value.code) &&
    isBoundedText(value.message, maxErrorMessageCharacters) &&
    value.message === agentRuntimeErrorMessage(value.code as AgentRuntimeErrorCode) &&
    typeof value.retryable === 'boolean' &&
    value.retryable === retryable
  )
}

/** Validates the complete main-to-renderer agent event schema before exposing it to UI code. */
export function isDesktopAgentEvent(value: unknown): value is DesktopAgentEvent {
  if (!isRecord(value) || !isBaseEvent(value)) return false
  switch (value.type) {
    case 'started':
      return hasOnlyKeys(value, ['type', 'runId', 'occurredAt', 'providerId', 'metadata', 'retryable'])
    case 'text-delta':
    case 'result':
      return hasOnlyKeys(value, ['type', 'runId', 'occurredAt', 'providerId', 'metadata', 'retryable', 'text']) && isBoundedText(value.text, maxTextCharacters)
    case 'error':
      return hasOnlyKeys(value, ['type', 'runId', 'occurredAt', 'providerId', 'metadata', 'retryable', 'error']) && isError(value.error, value.retryable as boolean)
    case 'done':
      return (
        hasOnlyKeys(value, ['type', 'runId', 'occurredAt', 'providerId', 'metadata', 'retryable', 'outcome']) &&
        (value.outcome === 'success' || value.outcome === 'error' || value.outcome === 'cancelled')
      )
    default:
      return false
  }
}
