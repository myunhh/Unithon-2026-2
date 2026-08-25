import type { SafeFieldValue, SafeFields } from './types.js'

export const REDACTED_VALUE = '[REDACTED]' as const

const OMIT_KEYS = new Set([
  'access_token',
  'api_key',
  'apikey',
  'authorization',
  'bearer',
  'body',
  'cookie',
  'cookies',
  'content',
  'credential',
  'credentials',
  'detail',
  'error',
  'error_body',
  'error_message',
  'filename',
  'id_token',
  'message',
  'model_output',
  'output',
  'password',
  'pdf',
  'pdf_body',
  'prompt',
  'question',
  'raw_body',
  'raw_error',
  'raw_provider_body',
  'raw_provider_error',
  'refresh_token',
  'secret',
  'selected',
  'selected_text',
  'selection',
  'session',
  'stack',
  'text',
  'token',
  'user_prompt',
  'response',
  'completion',
  'annotation',
  'document_body',
  'document_text',
  'pdf_content',
  'pdf_text',
  'provider_body',
  'provider_error',
  'provider_response',
  'raw_response',
  'raw_provider_response',
  'provider_raw_body',
  'provider_raw_error',
  'provider_raw_response',
  'private_key',
  'secret_key',
  'signing_key',
  'request_body',
  'upstream_body',
  'upstream_response',
  'upstream_error',
])

const REDACT_KEYS = new Set([
  'absolute_path',
  'cwd',
  'directory',
  'file_path',
  'path',
  'signed_url',
  'url_with_signature',
  'working_dir',
  'working_directory',
])

const FORBIDDEN_VALUE = /(?:bearer|basic)\s+[^\s]+|(?:^|[?;&\s])(?:token|secret|password|api[_-]?key|signature|sig|cookie)=[^\s;&]+|(?:^|[;\s])(?:cookie|set-cookie):\s*[^\s;]+|eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/i
const SIGNED_URL = /^https?:\/\/[^\s]+[?&](?:[^\s]*&)?(?:token|signature|sig|expires|x-amz-[^=]+)=[^\s&]+/i
const LOCAL_ABSOLUTE_PATH = /(?:^|[\s(])(?:~\/|file:\/\/|[A-Za-z]:[\\/]|\\\\|\/(?:Users|private|var|tmp|home|root|etc|opt|srv|mnt|Volumes)(?:\/|$))/i
const MAX_DEPTH = 8

function normalizedKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[\s-]/g, '_')
    .toLowerCase()
}

function shouldOmitKey(key: string): boolean {
  const normalized = normalizedKey(key)
  if (OMIT_KEYS.has(normalized)) return true
  const isTokenCount = /(?:^|_)(?:input|output|total)_tokens?$/.test(normalized) || normalized.endsWith('_token_count')
  if ((normalized.includes('token') && !isTokenCount) || normalized.includes('cookie')) return true
  if (normalized.includes('credential') || normalized.includes('password') || normalized.includes('secret')) return true
  if (normalized.includes('prompt') || normalized.includes('selected_text')) return true
  if (/^(?:assistant|ai|model|completion|generation|response)_output(?:_|$)/.test(normalized)) return true
  if (normalized.endsWith('_error') && /(?:provider|raw|upstream|http|remote)/.test(normalized)) return true
  if (normalized.endsWith('_response')) return true
  if (normalized.includes('raw_') && /(?:body|error|response|output)/.test(normalized)) return true
  if (normalized.includes('provider_') && /(?:body|error|response)/.test(normalized)) return true
  if (normalized.includes('upstream_') && /(?:body|error|response)/.test(normalized)) return true
  return false
}

function shouldRedactKey(key: string): boolean {
  const normalized = normalizedKey(key)
  return REDACT_KEYS.has(normalized) || normalized.endsWith('_path') || normalized.endsWith('_url')
}

function isForbiddenString(value: string): boolean {
  return FORBIDDEN_VALUE.test(value) || SIGNED_URL.test(value) || LOCAL_ABSOLUTE_PATH.test(value)
}

function isRecord(value: object): value is Readonly<Record<string, unknown>> {
  return !Array.isArray(value)
}

function isSafeRecord(value: SafeFieldValue): value is Readonly<Record<string, SafeFieldValue>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function sanitizeUnknown(
  value: unknown,
  active: WeakSet<object>,
  depth: number,
  redactValue: boolean,
): SafeFieldValue | undefined {
  if (value === undefined || typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') {
    return undefined
  }
  if (typeof value === 'string') {
    return redactValue || isForbiddenString(value) ? REDACTED_VALUE : value
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : REDACTED_VALUE
  }
  if (typeof value === 'boolean' || value === null) {
    return value
  }
  if (depth >= MAX_DEPTH || active.has(value)) {
    return REDACTED_VALUE
  }
  if (value instanceof Error) {
    return undefined
  }

  active.add(value)
  if (Array.isArray(value)) {
    const result: SafeFieldValue[] = []
    for (const item of value) {
      const safeItem = sanitizeUnknown(item, active, depth + 1, false)
      if (safeItem !== undefined) result.push(safeItem)
    }
    active.delete(value)
    return result
  }
  if (!isRecord(value)) {
    active.delete(value)
    return REDACTED_VALUE
  }

  const result: Record<string, SafeFieldValue> = {}
  for (const [key, item] of Object.entries(value)) {
    if (shouldOmitKey(key)) continue
    const safeItem = sanitizeUnknown(item, active, depth + 1, shouldRedactKey(key))
    if (safeItem !== undefined) result[key] = safeItem
  }
  active.delete(value)
  return result
}

export function sanitizeFields(input: Readonly<Record<string, unknown>> | undefined): SafeFields {
  if (input === undefined) return {}
  const safe = sanitizeUnknown(input, new WeakSet<object>(), 0, false)
  if (safe === undefined || !isSafeRecord(safe)) return {}
  return safe
}
