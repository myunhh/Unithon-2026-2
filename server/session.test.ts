import { describe, expect, it } from 'vitest'
import { loadServerEnv } from './env.js'
import { serializeSessionCookie, sessionIdFromCookie } from './session.js'

const sessionId = '0123456789abcdefghijklmnopqrstuv'
const secret = 'deterministic-test-session-secret'

describe('PaperBridge session cookies', () => {
  it('uses a signed opaque cookie and adds Secure only for HTTPS origins', () => {
    const httpsEnvironment = loadServerEnv({
      APP_ORIGIN: 'https://paperbridge.example.test',
      PAPERBRIDGE_SESSION_SECRET: secret,
    })
    const serialized = serializeSessionCookie(sessionId, httpsEnvironment)
    expect(serialized).toContain('HttpOnly')
    expect(serialized).toContain('SameSite=Strict')
    expect(serialized).toContain('Secure')

    const value = serialized.split(';', 1)[0]?.split('=', 2)[1]
    expect(sessionIdFromCookie(value, secret)).toBe(sessionId)
    expect(sessionIdFromCookie(`${value}x`, secret)).toBeNull()
  })
})
