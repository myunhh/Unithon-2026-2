import { describe, expect, it } from 'vitest'
import { loadServerEnv } from './env.js'

const testSessionSecret = 'test-only-session-secret'
const testProductionSessionSecret = 'A'.repeat(43)
const testOrigin = 'http://127.0.0.1:5173'

describe('loadServerEnv', () => {
  it('fails fast when the session secret is missing instead of generating one', () => {
    expect(() => loadServerEnv({ APP_ORIGINS: testOrigin })).toThrow('PAPERBRIDGE_SESSION_SECRET')
  })

  it('rejects a one-character production session secret', () => {
    expect(() => loadServerEnv({
      NODE_ENV: 'production',
      PAPERBRIDGE_SESSION_SECRET: 'x',
    })).toThrow('PAPERBRIDGE_SESSION_SECRET')
  })

  it('does not require Supabase for the local skeleton', () => {
    expect(loadServerEnv({ PORT: '9191', PAPERBRIDGE_SESSION_SECRET: testSessionSecret })).toMatchObject({
      nodeEnv: 'development',
      port: 9191,
      appOrigin: testOrigin,
    })
  })

  it('requires the Supabase URL and secret key as a pair', () => {
    expect(() => loadServerEnv({
      APP_ORIGINS: testOrigin,
      PAPERBRIDGE_SESSION_SECRET: testSessionSecret,
      SUPABASE_URL: 'https://project.supabase.co',
    })).toThrow('configured together')
  })

  it('accepts server-only Supabase configuration without changing public environment shape', () => {
    const environment = loadServerEnv({
      APP_ORIGINS: testOrigin,
      PAPERBRIDGE_SESSION_SECRET: testSessionSecret,
      SUPABASE_URL: 'https://project.supabase.co',
      SUPABASE_SECRET_KEY: 'test-only-supabase-key',
    })

    expect(environment.supabase?.url).toBe('https://project.supabase.co')
    expect(environment.supabase?.secretKey).toBe('test-only-supabase-key')
  })

  it('rejects control characters in the Supabase secret without echoing the credential', () => {
    const malformedCredential = 'test-only-credential\nsentinel'
    expect(() => loadServerEnv({
      PAPERBRIDGE_SESSION_SECRET: testSessionSecret,
      SUPABASE_URL: 'https://project.supabase.co',
      SUPABASE_SECRET_KEY: malformedCredential,
    })).toThrow('SUPABASE_SECRET_KEY')

    try {
      loadServerEnv({
        PAPERBRIDGE_SESSION_SECRET: testSessionSecret,
        SUPABASE_URL: 'https://project.supabase.co',
        SUPABASE_SECRET_KEY: malformedCredential,
      })
    } catch (error) {
      expect(String(error)).not.toContain(malformedCredential)
    }
  })

  it('rejects control characters in equivalent server credentials without echoing them', () => {
    const malformedSessionSecret = 'test-only-session\nsentinel'
    expect(() => loadServerEnv({ PAPERBRIDGE_SESSION_SECRET: malformedSessionSecret })).toThrow('PAPERBRIDGE_SESSION_SECRET is invalid.')
    try {
      loadServerEnv({ PAPERBRIDGE_SESSION_SECRET: malformedSessionSecret })
    } catch (error) {
      expect(String(error)).not.toContain(malformedSessionSecret)
    }

    const malformedProviderKey = 'base64url:test-only-provider\nsentinel'
    expect(() => loadServerEnv({ PAPERBRIDGE_SESSION_SECRET: testSessionSecret, PAPERBRIDGE_ENCRYPTION_KEY_V1: malformedProviderKey })).toThrow('PAPERBRIDGE_ENCRYPTION_KEY_V1 is invalid.')
    try {
      loadServerEnv({ PAPERBRIDGE_SESSION_SECRET: testSessionSecret, PAPERBRIDGE_ENCRYPTION_KEY_V1: malformedProviderKey })
    } catch (error) {
      expect(String(error)).not.toContain(malformedProviderKey)
    }
  })

  it('accepts canonical configuration and preserves the explicit runtime limits', () => {
    const masterKey = `base64url:${Buffer.alloc(32, 7).toString('base64url')}`
    const environment = loadServerEnv({
      NODE_ENV: 'production',
      PORT: '9191',
      APP_ORIGINS: 'https://reader.example.test,https://desktop.example.test',
      SUPABASE_URL: 'https://project.supabase.co',
      SUPABASE_SECRET_KEY: 'test-only-supabase-key',
      PAPERBRIDGE_SESSION_SECRET: testProductionSessionSecret,
      PAPERBRIDGE_ENCRYPTION_KEY_V1: masterKey,
      PAPERBRIDGE_ACTIVE_KEY_VERSION: '1',
      PAPERBRIDGE_MAX_PDF_BYTES: '52428800',
      PAPERBRIDGE_MAX_ACTIVE_RUNS_PER_USER: '8',
    })

    expect(environment).toMatchObject({
      nodeEnv: 'production',
      port: 9191,
      appOrigin: 'https://reader.example.test',
      appOrigins: ['https://reader.example.test', 'https://desktop.example.test'],
      providerEncryptionKeyVersion: 1,
      maxPdfBytes: 52428800,
      maxActiveRunsPerUser: 8,
    })
    expect(environment.providerEncryptionKey).toEqual(Buffer.alloc(32, 7))
  })

  it('uses canonical names when stale legacy aliases are also present', () => {
    const canonicalKey = `base64url:${Buffer.alloc(32, 8).toString('base64url')}`
    const staleKey = `base64url:${Buffer.alloc(32, 9).toString('base64url')}`
    const environment = loadServerEnv({
      APP_ORIGINS: 'https://canonical.example.test',
      APP_ORIGIN: 'https://stale.example.test',
      PAPERBRIDGE_SESSION_SECRET: testSessionSecret,
      PAPERBRIDGE_ENCRYPTION_KEY_V1: canonicalKey,
      PAPERBRIDGE_ENCRYPTION_KEY: staleKey,
    })

    expect(environment.appOrigins).toEqual(['https://canonical.example.test'])
    expect(environment.providerEncryptionKey).toEqual(Buffer.alloc(32, 8))
  })

  it('rejects malformed values without echoing the supplied value', () => {
    const malformedValue = 'not-a-real-config-value'
    expect(() => loadServerEnv({
      APP_ORIGINS: `https://reader.example.test/${malformedValue}`,
      PAPERBRIDGE_SESSION_SECRET: testSessionSecret,
    })).toThrow('APP_ORIGINS')

    try {
      loadServerEnv({
        APP_ORIGINS: `https://reader.example.test/${malformedValue}`,
        PAPERBRIDGE_SESSION_SECRET: testSessionSecret,
      })
    } catch (error) {
      expect(String(error)).not.toContain(malformedValue)
    }
  })

  it('rejects a per-session run limit above the runtime capacity', () => {
    expect(() => loadServerEnv({
      PAPERBRIDGE_SESSION_SECRET: testSessionSecret,
      PAPERBRIDGE_MAX_ACTIVE_RUNS_PER_USER: '33',
    })).toThrow('PAPERBRIDGE_MAX_ACTIVE_RUNS_PER_USER')
  })

  it('parses only the strict server-side provider encryption key representation', () => {
    const masterKey = `base64url:${Buffer.alloc(32, 7).toString('base64url')}`
    const environment = loadServerEnv({ PAPERBRIDGE_SESSION_SECRET: testSessionSecret, PAPERBRIDGE_ENCRYPTION_KEY: masterKey })
    expect(environment.providerEncryptionKey).toEqual(Buffer.alloc(32, 7))

    const invalid = 'base64url:not-a-valid-provider-master-key'
    expect(() => loadServerEnv({ PAPERBRIDGE_SESSION_SECRET: testSessionSecret, PAPERBRIDGE_ENCRYPTION_KEY: invalid })).toThrow('PAPERBRIDGE_ENCRYPTION_KEY is invalid.')
    try {
      loadServerEnv({ PAPERBRIDGE_SESSION_SECRET: testSessionSecret, PAPERBRIDGE_ENCRYPTION_KEY: invalid })
    } catch (error) {
      expect(String(error)).not.toContain(invalid)
    }
  })
})
