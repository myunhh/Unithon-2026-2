import { describe, expect, it } from 'vitest'
import { loadServerEnv } from './env.js'

describe('loadServerEnv', () => {
  it('does not require Supabase for the local skeleton', () => {
    expect(loadServerEnv({ PORT: '9191' })).toMatchObject({
      nodeEnv: 'development',
      port: 9191,
      appOrigin: 'http://127.0.0.1:5173',
    })
  })

  it('requires the Supabase URL and secret key as a pair', () => {
    expect(() => loadServerEnv({ SUPABASE_URL: 'https://project.supabase.co' })).toThrow('configured together')
  })

  it('accepts server-only Supabase configuration without changing public environment shape', () => {
    const environment = loadServerEnv({
      SUPABASE_URL: 'https://project.supabase.co',
      SUPABASE_SECRET_KEY: 'server-secret',
    })

    expect(environment.supabase?.url).toBe('https://project.supabase.co')
    expect(environment.supabase?.secretKey).toBe('server-secret')
  })

  it('parses only the strict server-side provider encryption key representation', () => {
    const masterKey = `base64url:${Buffer.alloc(32, 7).toString('base64url')}`
    const environment = loadServerEnv({ PAPERBRIDGE_ENCRYPTION_KEY: masterKey })
    expect(environment.providerEncryptionKey).toEqual(Buffer.alloc(32, 7))

    const invalid = 'base64url:not-a-valid-provider-master-key'
    expect(() => loadServerEnv({ PAPERBRIDGE_ENCRYPTION_KEY: invalid })).toThrow('PAPERBRIDGE_ENCRYPTION_KEY is invalid.')
    try {
      loadServerEnv({ PAPERBRIDGE_ENCRYPTION_KEY: invalid })
    } catch (error) {
      expect(String(error)).not.toContain(invalid)
    }
  })
})
