import type { MiddlewareHandler } from 'hono'

const DEFAULT_ALLOWED_METHODS = [
  'GET',
  'HEAD',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'OPTIONS',
] as const

const DEFAULT_ALLOWED_HEADERS = [
  'Content-Type',
  'Authorization',
  'Idempotency-Key',
  'If-Match',
  'Last-Event-ID',
] as const

const SAFE_RESPONSE_HEADERS = [
  ['X-Content-Type-Options', 'nosniff'],
  ['X-Frame-Options', 'DENY'],
  ['Referrer-Policy', 'no-referrer'],
  ['Strict-Transport-Security', 'max-age=31536000; includeSubDomains'],
  ['Cross-Origin-Resource-Policy', 'same-origin'],
  ['Cross-Origin-Opener-Policy', 'same-origin'],
  ['Origin-Agent-Cluster', '?1'],
  ['X-DNS-Prefetch-Control', 'off'],
  ['X-Download-Options', 'noopen'],
  ['X-Permitted-Cross-Domain-Policies', 'none'],
  ['X-XSS-Protection', '0'],
  ['Permissions-Policy', 'camera=(), geolocation=(), microphone=()'],
] as const

export type HttpSecurityConfig = Readonly<{
  readonly allowedOrigins: readonly string[]
  readonly maxBodyBytes: number
  readonly allowMethods?: readonly string[]
  readonly allowHeaders?: readonly string[]
  readonly maxAgeSeconds?: number
}>

export type HttpSecurityMiddleware = MiddlewareHandler

type ValidatedHttpSecurityConfig = Readonly<{
  readonly allowedOrigins: ReadonlySet<string>
  readonly allowMethods: readonly string[]
  readonly allowMethodNames: ReadonlySet<string>
  readonly allowHeaders: readonly string[]
  readonly allowHeaderNames: ReadonlySet<string>
  readonly maxAgeSeconds: number | undefined
  readonly maxBodyBytes: number
}>

function assertSafeOrigin(origin: string): void {
  if (origin === '*' || origin.length === 0) {
    throw new RangeError('allowedOrigins must contain exact origins')
  }

  const schemeSeparator = origin.indexOf('://')
  if (schemeSeparator < 0) {
    throw new RangeError('allowedOrigins must contain valid HTTP origins')
  }

  const scheme = origin.slice(0, schemeSeparator)
  const authority = origin.slice(schemeSeparator + 3)
  if (
    (scheme !== 'http' && scheme !== 'https') ||
    authority.length === 0 ||
    authority.includes('/') ||
    authority.includes('?') ||
    authority.includes('#') ||
    authority.includes('@') ||
    !isValidOriginAuthority(authority)
  ) {
    throw new RangeError('allowedOrigins must contain exact HTTP origins')
  }
}

function isValidOriginAuthority(authority: string): boolean {
  const hostAndPort = authority.startsWith('[')
    ? /^\[[0-9a-fA-F:.]+\](?::([0-9]+))?$/.exec(authority)
    : /^(localhost|(?:[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?|(?:\d{1,3}\.){3}\d{1,3}))(?::([0-9]+))?$/.exec(
        authority,
      )
  if (!hostAndPort) {
    return false
  }

  const port = authority.startsWith('[') ? hostAndPort[1] : hostAndPort[2]
  return port === undefined || (Number.isSafeInteger(Number(port)) && Number(port) <= 65535)
}

function assertNonWildcardNames(names: readonly string[], label: string): readonly string[] {
  if (names.length === 0) {
    throw new RangeError(`${label} must contain at least one value`)
  }

  const normalized = names.map((name) => name.trim())
  if (normalized.some((name) => name.length === 0 || name === '*')) {
    throw new RangeError(`${label} cannot contain empty or wildcard values`)
  }

  return normalized
}

function validateConfig(config: HttpSecurityConfig): ValidatedHttpSecurityConfig {
  if (!Number.isSafeInteger(config.maxBodyBytes) || config.maxBodyBytes <= 0) {
    throw new RangeError('maxBodyBytes must be a positive safe integer')
  }

  if (config.allowedOrigins.length === 0) {
    throw new RangeError('allowedOrigins must contain at least one origin')
  }
  config.allowedOrigins.forEach(assertSafeOrigin)

  const allowMethods = assertNonWildcardNames(
    config.allowMethods ?? DEFAULT_ALLOWED_METHODS,
    'allowMethods',
  ).map((method) => method.toUpperCase())
  const allowHeaders = assertNonWildcardNames(
    config.allowHeaders ?? DEFAULT_ALLOWED_HEADERS,
    'allowHeaders',
  )
  const maxAgeSeconds = config.maxAgeSeconds
  if (
    maxAgeSeconds !== undefined &&
    (!Number.isSafeInteger(maxAgeSeconds) || maxAgeSeconds < 0)
  ) {
    throw new RangeError('maxAgeSeconds must be a non-negative safe integer')
  }

  return {
    allowedOrigins: new Set(config.allowedOrigins),
    maxBodyBytes: config.maxBodyBytes,
    allowMethods,
    allowMethodNames: new Set(allowMethods),
    allowHeaders,
    allowHeaderNames: new Set(allowHeaders.map((header) => header.toLowerCase())),
    maxAgeSeconds,
  }
}

function setBaselineHeaders(context: Parameters<MiddlewareHandler>[0]): void {
  context.header('Cache-Control', 'no-store')
  SAFE_RESPONSE_HEADERS.forEach(([name, value]) => context.header(name, value))
}

function setCorsHeaders(
  context: Parameters<MiddlewareHandler>[0],
  origin: string | undefined,
): void {
  if (origin === undefined) {
    return
  }

  context.header('Access-Control-Allow-Origin', origin)
  context.header('Access-Control-Allow-Credentials', 'true')
}

function setVary(context: Parameters<MiddlewareHandler>[0], value: string): void {
  context.header('Vary', value, { append: true })
}

function originNotAllowed(context: Parameters<MiddlewareHandler>[0]) {
  return context.json({ code: 'origin_not_allowed' }, 403)
}

async function bodyWithinLimit(
  context: Parameters<MiddlewareHandler>[0],
  maxBodyBytes: number,
): Promise<boolean> {
  if (context.req.raw.body === null) {
    return true
  }

  const body = context.req.raw.clone().body
  if (body === null) {
    return true
  }

  const reader = body.getReader()
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) {
      return true
    }

    size += value.byteLength
    if (size > maxBodyBytes) {
      return false
    }
  }
}

function requestedHeadersAreAllowed(
  requestHeaders: string | undefined,
  config: ValidatedHttpSecurityConfig,
): boolean {
  if (requestHeaders === undefined || requestHeaders.trim().length === 0) {
    return true
  }

  return requestHeaders
    .split(',')
    .map((header) => header.trim().toLowerCase())
    .every((header) => config.allowHeaderNames.has(header))
}

export function createHttpSecurityMiddleware(
  input: HttpSecurityConfig,
): HttpSecurityMiddleware {
  const config = validateConfig(input)

  return async (context, next) => {
    setBaselineHeaders(context)

    const origin = context.req.header('Origin')
    if (origin !== undefined) {
      setVary(context, 'Origin')
      if (!config.allowedOrigins.has(origin)) {
        return originNotAllowed(context)
      }

      setCorsHeaders(context, origin)
    }

    if (context.req.method === 'OPTIONS' && origin !== undefined) {
      setVary(context, 'Access-Control-Request-Method')
      setVary(context, 'Access-Control-Request-Headers')

      const requestedMethod = context.req.header('Access-Control-Request-Method')
      if (
        requestedMethod !== undefined &&
        !config.allowMethodNames.has(requestedMethod.toUpperCase())
      ) {
        return originNotAllowed(context)
      }

      const requestedHeaders = context.req.header('Access-Control-Request-Headers')
      if (!requestedHeadersAreAllowed(requestedHeaders, config)) {
        return originNotAllowed(context)
      }

      context.header('Access-Control-Allow-Methods', config.allowMethods.join(', '))
      context.header('Access-Control-Allow-Headers', config.allowHeaders.join(', '))
      if (config.maxAgeSeconds !== undefined) {
        context.header('Access-Control-Max-Age', String(config.maxAgeSeconds))
      }
      return context.body(null, 204)
    }

    try {
      if (!(await bodyWithinLimit(context, config.maxBodyBytes))) {
        return context.json({ code: 'payload_too_large' }, 413)
      }

      try {
        await next()
      } finally {
        setBaselineHeaders(context)
        setCorsHeaders(context, origin)
      }
    } finally {
      setBaselineHeaders(context)
      setCorsHeaders(context, origin)
    }
  }
}

export const createHttpSecurityPolicy = createHttpSecurityMiddleware
