import { config } from 'dotenv'
import { randomBytes } from 'node:crypto'
import { parseProviderMasterKey } from './providers/crypto.js'

// `.env.local` is intentionally server-only (and ignored by git). Load `.env`
// afterwards as a fallback without replacing values supplied by the environment
// or local development configuration.
config({ path: '.env.local', quiet: true })
config({ path: '.env', quiet: true })

type Environment = Record<string, string | undefined>

export type ServerEnv = {
  nodeEnv: 'development' | 'test' | 'production'
  port: number
  appOrigin: string
  /** Server-only signing key for the opaque PaperBridge session cookie. */
  sessionSecret: string
  /** Parsed server-only AES-256-GCM key; undefined keeps provider storage disabled. */
  providerEncryptionKey?: Buffer
  supabase?: {
    url: string
    secretKey: string
  }
}

function parsePort(value: string | undefined): number {
  if (!value) return 8787
  const port = Number(value)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.')
  }
  return port
}

function parseNodeEnv(value: string | undefined): ServerEnv['nodeEnv'] {
  if (value === 'production' || value === 'test') return value
  return 'development'
}

function parseAppOrigin(value: string | undefined): string {
  const origin = value?.trim() || 'http://127.0.0.1:5173'
  try {
    const parsed = new URL(origin)
    if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || parsed.origin !== origin) {
      throw new Error()
    }
    return origin
  } catch {
    throw new Error('APP_ORIGIN must be an absolute HTTP(S) origin without a path.')
  }
}

function sessionSecretFrom(environment: Environment): string {
  const configured = environment.PAPERBRIDGE_SESSION_SECRET?.trim()
  // A generated secret makes a standalone server safe by default. Electron
  // persists one per installation before it starts the packaged server.
  return configured || randomBytes(32).toString('base64url')
}

function providerEncryptionKeyFrom(environment: Environment): Buffer | undefined {
  const configured = environment.PAPERBRIDGE_ENCRYPTION_KEY?.trim()
  if (!configured) return undefined
  try {
    return parseProviderMasterKey(configured)
  } catch {
    // The strict parser deliberately never includes configured input in its
    // error; retain that boundary here because this reaches process startup.
    throw new Error('PAPERBRIDGE_ENCRYPTION_KEY is invalid.')
  }
}

export function loadServerEnv(environment: Environment = process.env): ServerEnv {
  const supabaseUrl = environment.SUPABASE_URL?.trim()
  const supabaseSecretKey = environment.SUPABASE_SECRET_KEY?.trim()
  const providerEncryptionKey = providerEncryptionKeyFrom(environment)

  if (Boolean(supabaseUrl) !== Boolean(supabaseSecretKey)) {
    throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY must be configured together.')
  }

  if (supabaseUrl) {
    try {
      new URL(supabaseUrl)
    } catch {
      throw new Error('SUPABASE_URL must be a valid URL.')
    }
  }

  return {
    nodeEnv: parseNodeEnv(environment.NODE_ENV),
    port: parsePort(environment.PORT),
    appOrigin: parseAppOrigin(environment.APP_ORIGIN),
    sessionSecret: sessionSecretFrom(environment),
    ...(providerEncryptionKey ? { providerEncryptionKey } : {}),
    ...(supabaseUrl && supabaseSecretKey
      ? { supabase: { url: supabaseUrl, secretKey: supabaseSecretKey } }
      : {}),
  }
}
