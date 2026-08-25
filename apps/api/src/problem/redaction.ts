import type {
  ProblemFieldError,
  ProblemMeta,
} from './registry.js'

const MAX_DETAIL_LENGTH = 500
const MAX_ERROR_ITEMS = 100
const MAX_ERROR_PATH_LENGTH = 200
const MAX_ERROR_CODE_LENGTH = 100
const MAX_META_ENTRIES = 32
const MAX_META_DEPTH = 2
const MAX_META_ARRAY_ITEMS = 32
const MAX_META_STRING_LENGTH = 200

const controlCharacters = /[\u0000-\u001f\u007f]/g
const assignmentKey =
  /(?<![A-Za-z0-9_])(["']?)([A-Za-z][A-Za-z0-9]*(?:[-_ ][A-Za-z0-9]+)*)\1\s*[:=]\s*/g
const assignmentValue =
  /(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|(?:Bearer\s+)?[^\s,;}]+)/y
const oauthCredentialKeyFamilies = [
  ['access', 'token'],
  ['refresh', 'token'],
  ['id', 'token'],
  ['client', 'secret'],
  ['private', 'key'],
] as const
const sensitiveAssignmentKeys: readonly string[] = [
  'authorization',
  'cookie',
  'set_cookie',
  'x_api_key',
  'api_key',
  'access_key',
  'api_secret',
  'secret_key',
  'signing_key',
  'encryption_key',
  'oauth_secret',
  'oauth_token',
  'service_account_key',
  'service_account_secret',
  'service_account_token',
  'bearer_token',
  'session_token',
  'jwt_secret',
  'database_password',
  'token',
  'secret',
  'password',
  'credential',
] as const
const bearerValue = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi
const querySecret = /([?&](?:token|key|secret|password|signature|sig)=)[^&\s]+/gi
const unixAbsolutePath = /(^|[\s"'(=])\/(?!\/)[^\s,;)'"]+/g
const windowsAbsolutePath = /(?:[A-Za-z]:[\\/](?![\\/])[^\s,;)'"]+|~[\\/][^\s,;)'"]+)/g
const uncAbsolutePath = /(^|[\s"'(=])(?:\\\\|\/{2})[^\s,;)'"]+/g
const sensitiveText =
  /\b(?:raw\s+(?:provider\s+)?(?:response|error|body)|provider\s+(?:response|error|body)|pdf\s+body|selected\s+text|model\s+output|completion|prompt)\b/i
const sensitiveKey =
  /(?:authorization|cookie|token|secret|password|credential|api[-_ ]?key|raw|body|response|prompt|output|completion|selected[-_ ]?text|pdf|content|stack|trace|path)/i
const safeMetaKey = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/
const safeErrorCode = /^[a-z][a-z0-9_.-]{1,99}$/
const safeMetaIdentifier = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/
const allowedMetaKeys = new Set([
  'dependency',
  'field',
  'limit',
  'model',
  'operation',
  'provider',
  'resource',
  'retryAfterSeconds',
  'status',
])
const identifierMetaKeys = new Set([
  'dependency',
  'field',
  'model',
  'operation',
  'provider',
  'resource',
])

function normalizeCredentialKey(key: string): string {
  return key
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function isSensitiveCredentialKey(key: string): boolean {
  const normalizedKey = normalizeCredentialKey(key)
  const keyParts = normalizedKey.split('_')
  const compactKey = keyParts.join('')
  const isOauthCredential = oauthCredentialKeyFamilies.some(
    ([prefix, suffix]) =>
      (keyParts[0] === prefix && keyParts[1] === suffix) || compactKey.startsWith(`${prefix}${suffix}`),
  )
  return isOauthCredential || sensitiveAssignmentKeys.includes(normalizedKey)
}

function redactCredentialAssignments(value: string): string {
  const parts: string[] = []
  let cursor = 0
  assignmentKey.lastIndex = 0
  let match = assignmentKey.exec(value)
  while (match !== null) {
    if (match.index < cursor) {
      match = assignmentKey.exec(value)
      continue
    }
    const matchEnd = match.index + match[0].length
    parts.push(value.slice(cursor, match.index), match[0])
    cursor = matchEnd
    const key = match[2]
    if (key !== undefined && isSensitiveCredentialKey(key)) {
      assignmentValue.lastIndex = matchEnd
      const valueMatch = assignmentValue.exec(value)
      if (valueMatch !== null) {
        parts.push('[redacted-secret]')
        cursor = matchEnd + valueMatch[0].length
      }
    }
    match = assignmentKey.exec(value)
  }
  parts.push(value.slice(cursor))
  return parts.join('')
}

export interface PublicMetaObject {
  readonly [key: string]: PublicMetaValue
}

export type PublicMetaValue =
  | string
  | number
  | boolean
  | null
  | readonly PublicMetaValue[]
  | PublicMetaObject

export function sanitizePublicText(value: string, maxLength: number): string | undefined {
  const sanitized = redactCredentialAssignments(value.replace(controlCharacters, ' '))
    .replace(bearerValue, '[redacted-secret]')
    .replace(querySecret, '$1[redacted-secret]')
    .replace(unixAbsolutePath, (_match: string, prefix: string) => `${prefix}[redacted-path]`)
    .replace(windowsAbsolutePath, '[redacted-path]')
    .replace(uncAbsolutePath, (_match: string, prefix: string) => `${prefix}[redacted-path]`)
    .trim()
  if (!sanitized) return undefined
  return sanitized.length > maxLength ? `${sanitized.slice(0, maxLength - 1)}…` : sanitized
}

export function sanitizeProblemDetail(value: string | undefined): string | undefined {
  if (value === undefined || sensitiveText.test(value)) return undefined
  const sanitized = sanitizePublicText(value, MAX_DETAIL_LENGTH)
  return sanitized && !sensitiveText.test(sanitized) ? sanitized : undefined
}

export function sanitizeProblemErrors(
  errors: readonly ProblemFieldError[] | undefined,
): readonly ProblemFieldError[] | undefined {
  if (errors === undefined) return undefined
  const sanitized: ProblemFieldError[] = []
  for (const error of errors.slice(0, MAX_ERROR_ITEMS)) {
    const path = sanitizePublicText(error.path, MAX_ERROR_PATH_LENGTH)
    const code = sanitizePublicText(error.code, MAX_ERROR_CODE_LENGTH)
    if (path === undefined || code === undefined || !safeErrorCode.test(code)) continue
    const message = error.message === undefined ? undefined : sanitizeProblemDetail(error.message)
    sanitized.push(message === undefined ? { path, code } : { path, code, message })
  }
  return sanitized.length === 0 ? undefined : sanitized
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function sanitizeMetaKey(key: string): string | undefined {
  if (sensitiveKey.test(key) || !safeMetaKey.test(key) || !allowedMetaKeys.has(key)) return undefined
  return key
}

function sanitizeMetaValue(value: unknown, depth: number): PublicMetaValue | undefined {
  if (typeof value === 'string') {
    const sanitized = sanitizePublicText(value, MAX_META_STRING_LENGTH)
    return sanitized && !sensitiveText.test(sanitized) ? sanitized : undefined
  }
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value === 'boolean' || value === null) return value
  if (depth >= MAX_META_DEPTH) return undefined
  if (Array.isArray(value)) {
    const sanitized = value
      .slice(0, MAX_META_ARRAY_ITEMS)
      .map((item) => sanitizeMetaValue(item, depth + 1))
      .filter((item): item is PublicMetaValue => item !== undefined)
    return sanitized.length === 0 ? undefined : sanitized
  }
  if (!isRecord(value)) return undefined
  const sanitized: Record<string, PublicMetaValue> = {}
  for (const [key, item] of Object.entries(value).slice(0, MAX_META_ENTRIES)) {
    const safeKey = sanitizeMetaKey(key)
    const safeValue = safeKey === undefined ? undefined : sanitizeMetaValue(item, depth + 1)
    const validIdentifier =
      safeKey === undefined ||
      !identifierMetaKeys.has(safeKey) ||
      (typeof safeValue === 'string' && safeMetaIdentifier.test(safeValue))
    if (validIdentifier && safeKey !== undefined && safeValue !== undefined) sanitized[safeKey] = safeValue
  }
  return Object.keys(sanitized).length === 0 ? undefined : sanitized
}

export function sanitizeProblemMeta(meta: ProblemMeta | undefined): ProblemMeta | undefined {
  const sanitized = sanitizeMetaValue(meta, 0)
  return isRecord(sanitized) ? sanitized : undefined
}

export function normalizeRequestId(requestId: string): string {
  return sanitizePublicText(requestId, 100) ?? 'unknown-request'
}
