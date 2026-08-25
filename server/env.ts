import { config } from 'dotenv'
import { parseProviderMasterKey } from './providers/crypto.js'

// `.env.local` is intentionally server-only (and ignored by git). Load `.env`
// afterwards as a fallback without replacing values supplied by the environment
// or local development configuration.
config({ path: '.env.local', quiet: true })
config({ path: '.env', quiet: true })

type Environment = Record<string, string | undefined>

const DEFAULT_PORT = 8787
const DEFAULT_APP_ORIGINS = ['http://127.0.0.1:5173'] as const
const DEFAULT_MAX_PDF_BYTES = 50 * 1024 * 1024
const DEFAULT_MAX_ACTIVE_RUNS_PER_USER = 4
const KEY_VERSION = 1
export const MAX_ACTIVE_PROVIDER_RUNS = 32
const PRODUCTION_SESSION_SECRET_PATTERN = /^[A-Za-z0-9_-]{32,128}$/

export type ServerEnv = {
  nodeEnv: 'development' | 'test' | 'production'
  port: number
  appOrigins: readonly string[]
  appOrigin: string
  /** Server-only signing key for the opaque PaperBridge session cookie. */
  sessionSecret: string
  /** Parsed server-only AES-256-GCM key; undefined keeps provider storage disabled. */
  providerEncryptionKey?: Buffer
  providerEncryptionKeyVersion: typeof KEY_VERSION
  maxPdfBytes: number
  maxActiveRunsPerUser: number
  supabase?: {
    url: string
    secretKey: string
  }
}

function parsePort(value: string | undefined): number {
  if (value === undefined) return DEFAULT_PORT
  const port = Number(value)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.')
  }
  return port
}

function parseNodeEnv(value: string | undefined): ServerEnv['nodeEnv'] {
  if (value === undefined) return 'development'
  if (value === 'development' || value === 'production' || value === 'test') return value
  throw new Error('NODE_ENV must be development, test, or production.')
}

function parseAppOrigins(value: string | undefined): readonly [string, ...string[]] {
  if (value === undefined) return [...DEFAULT_APP_ORIGINS]
  const origins = value.split(',').map((origin) => origin.trim())
  if (origins.length === 0 || origins.some((origin) => origin.length === 0)) {
    throw new Error('APP_ORIGINS must contain one or more HTTP(S) origins.')
  }

  const parsedOrigins = origins.map((origin) => {
    try {
      const parsed = new URL(origin)
      if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || parsed.origin !== origin) {
        throw new Error()
      }
      return parsed.origin
    } catch {
      throw new Error('APP_ORIGINS must contain absolute HTTP(S) origins without paths.')
    }
  })

  if (new Set(parsedOrigins).size !== parsedOrigins.length) {
    throw new Error('APP_ORIGINS must not contain duplicates.')
  }
  const [firstOrigin, ...remainingOrigins] = parsedOrigins
  if (firstOrigin === undefined) throw new Error('APP_ORIGINS must contain one or more HTTP(S) origins.')
  return [firstOrigin, ...remainingOrigins]
}

function requiredText(environment: Environment, key: string): string {
  const configured = configuredText(environment, key)
  if (!configured) throw new Error(`${key} is required.`)
  return configured
}

function configuredText(environment: Environment, key: string): string | undefined {
  const raw = environment[key]
  if (raw !== undefined && hasAsciiControlCharacter(raw)) throw new Error(`${key} is invalid.`)
  return raw?.trim()
}

function sessionSecretFrom(environment: Environment, nodeEnv: ServerEnv['nodeEnv']): string {
  const configured = requiredText(environment, 'PAPERBRIDGE_SESSION_SECRET')
  if (nodeEnv === 'production' && !PRODUCTION_SESSION_SECRET_PATTERN.test(configured)) {
    throw new Error('PAPERBRIDGE_SESSION_SECRET must be 32-128 base64url characters in production.')
  }
  return configured
}

function configuredValue(environment: Environment, key: string, legacyKey?: string): { key: string; value: string | undefined } {
  const configured = environment[key]
  if (configured !== undefined) return { key, value: configured }
  if (legacyKey !== undefined && environment[legacyKey] !== undefined) {
    return { key: legacyKey, value: environment[legacyKey] }
  }
  return { key, value: undefined }
}

type PositiveIntegerOptions = {
  readonly fallback: number
  readonly maximum?: number
}

function parsePositiveInteger(value: string | undefined, key: string, options: PositiveIntegerOptions): number {
  if (value === undefined) return options.fallback
  if (!/^[0-9]+$/.test(value)) throw new Error(`${key} must be a positive integer.`)
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > (options.maximum ?? Number.MAX_SAFE_INTEGER)) {
    throw new Error(`${key} must be a positive integer.`)
  }
  return parsed
}

function providerEncryptionKeyFrom(environment: Environment): { key: Buffer; version: typeof KEY_VERSION } | undefined {
  const configured = configuredValue(environment, 'PAPERBRIDGE_ENCRYPTION_KEY_V1', 'PAPERBRIDGE_ENCRYPTION_KEY')
  if (configured.value !== undefined && hasAsciiControlCharacter(configured.value)) throw new Error(`${configured.key} is invalid.`)
  const value = configured.value?.trim()
  const activeKeyVersion = parsePositiveInteger(
    environment.PAPERBRIDGE_ACTIVE_KEY_VERSION,
    'PAPERBRIDGE_ACTIVE_KEY_VERSION',
    { fallback: KEY_VERSION },
  )
  if (activeKeyVersion !== KEY_VERSION) throw new Error('PAPERBRIDGE_ACTIVE_KEY_VERSION is unsupported.')
  if (!value) return undefined
  try {
    return { key: parseProviderMasterKey(value), version: KEY_VERSION }
  } catch {
    // The strict parser deliberately never includes configured input in its
    // error; retain that boundary here because this reaches process startup.
    throw new Error(`${configured.key} is invalid.`)
  }
}

function hasAsciiControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code < 32 || code === 127) return true
  }
  return false
}

export function loadServerEnv(environment: Environment = process.env): ServerEnv {
  const nodeEnv = parseNodeEnv(environment.NODE_ENV)
  const supabaseUrl = configuredText(environment, 'SUPABASE_URL')
  const supabaseSecretKey = configuredText(environment, 'SUPABASE_SECRET_KEY')
  const providerEncryptionKey = providerEncryptionKeyFrom(environment)

  if (Boolean(supabaseUrl) !== Boolean(supabaseSecretKey)) {
    throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY must be configured together.')
  }

  if (supabaseUrl) {
    try {
      const parsed = new URL(supabaseUrl)
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error()
    } catch {
      throw new Error('SUPABASE_URL must be a valid URL.')
    }
  }

  // Canonical plural configuration wins; the singular fallback remains only for the existing Electron seam.
  const appOrigins = parseAppOrigins(configuredValue(environment, 'APP_ORIGINS', 'APP_ORIGIN').value)
  const sessionSecret = sessionSecretFrom(environment, nodeEnv)
  const maxPdfBytes = parsePositiveInteger(
    environment.PAPERBRIDGE_MAX_PDF_BYTES,
    'PAPERBRIDGE_MAX_PDF_BYTES',
    { fallback: DEFAULT_MAX_PDF_BYTES, maximum: DEFAULT_MAX_PDF_BYTES },
  )
  const maxActiveRunsPerUser = parsePositiveInteger(
    environment.PAPERBRIDGE_MAX_ACTIVE_RUNS_PER_USER,
    'PAPERBRIDGE_MAX_ACTIVE_RUNS_PER_USER',
    { fallback: DEFAULT_MAX_ACTIVE_RUNS_PER_USER, maximum: MAX_ACTIVE_PROVIDER_RUNS },
  )

  return {
    nodeEnv,
    port: parsePort(environment.PORT),
    appOrigins,
    appOrigin: appOrigins[0],
    sessionSecret,
    providerEncryptionKeyVersion: providerEncryptionKey?.version ?? KEY_VERSION,
    maxPdfBytes,
    maxActiveRunsPerUser,
    ...(providerEncryptionKey ? { providerEncryptionKey: providerEncryptionKey.key } : {}),
    ...(supabaseUrl && supabaseSecretKey
      ? { supabase: { url: supabaseUrl, secretKey: supabaseSecretKey } }
      : {}),
  }
}
