export const PUBLIC_API_ENV_KEY = 'VITE_PUBLIC_API_URL' as const

export const PUBLIC_FRONTEND_CONFIG_ERROR_CODES = {
  missingApiUrl: 'missing_api_url',
  invalidApiUrl: 'invalid_api_url',
} as const

export type PublicFrontendConfigErrorCode = (typeof PUBLIC_FRONTEND_CONFIG_ERROR_CODES)[keyof typeof PUBLIC_FRONTEND_CONFIG_ERROR_CODES]

export type PublicFrontendConfig = Readonly<{
  apiBaseUrl: string
}>

export class PublicFrontendConfigError extends Error {
  readonly name = 'PublicFrontendConfigError'
  readonly code: PublicFrontendConfigErrorCode

  constructor(code: PublicFrontendConfigErrorCode) {
    super(PUBLIC_FRONTEND_CONFIG_ERROR_MESSAGES[code])
    this.code = code
  }
}

const PUBLIC_FRONTEND_CONFIG_ERROR_MESSAGES: Readonly<Record<PublicFrontendConfigErrorCode, string>> = {
  missing_api_url: `Public frontend configuration is missing. Set ${PUBLIC_API_ENV_KEY} to an API URL.`,
  invalid_api_url: `Public frontend configuration is invalid. Set ${PUBLIC_API_ENV_KEY} to an HTTP(S) URL or the same-origin /api path.`,
}

export type PublicFrontendEnvironment = Readonly<Record<string, unknown>>

export function parsePublicFrontendConfig(environment: PublicFrontendEnvironment): PublicFrontendConfig {
  const rawValue = environment[PUBLIC_API_ENV_KEY]
  if (rawValue === undefined || (typeof rawValue === 'string' && rawValue.trim().length === 0)) {
    throw new PublicFrontendConfigError(PUBLIC_FRONTEND_CONFIG_ERROR_CODES.missingApiUrl)
  }

  const parsedValue = parsePublicApiUrl(rawValue)
  if (parsedValue === undefined) {
    throw new PublicFrontendConfigError(PUBLIC_FRONTEND_CONFIG_ERROR_CODES.invalidApiUrl)
  }

  return Object.freeze({ apiBaseUrl: parsedValue })
}

function parsePublicApiUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (trimmed.startsWith('/')) return parseRelativeApiPath(trimmed)
  if (trimmed.includes('?') || trimmed.includes('#')) return undefined

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return undefined
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined
  if (parsed.username || parsed.password || parsed.search || parsed.hash) return undefined
  if (!isOpenApiPath(parsed.pathname)) return undefined
  return `${parsed.origin}${withoutTrailingSlash(parsed.pathname)}`
}

function parseRelativeApiPath(value: string): string | undefined {
  if (value.startsWith('//') || value.includes('?') || value.includes('#')) return undefined
  return isCompatibilityApiPath(value) ? withoutTrailingSlash(value) : undefined
}

function isCompatibilityApiPath(pathname: string): boolean {
  return pathname === '/api' || pathname.startsWith('/api/')
}

function isOpenApiPath(pathname: string): boolean {
  return pathname === '/v1' || pathname.startsWith('/v1/')
}

function withoutTrailingSlash(value: string): string {
  const normalized = value.replace(/\/+$/, '')
  return normalized || '/'
}
