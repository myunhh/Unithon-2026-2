import { once } from 'node:events'
import { describe, expect, it } from 'vitest'
import { createApiServer } from './app.js'
import {
  ACCESS_TOKEN_COOKIE_NAME,
  InMemoryAuthRateLimiter,
  REFRESH_TOKEN_COOKIE_NAME,
  type AuthService,
} from './auth.js'
import type { DocumentStore } from './documents.js'
import { loadServerEnv } from './env.js'
import { storageNamespaceForUser } from './session.js'

const appOrigin = 'http://127.0.0.1:5173'
const secret = 'deterministic-test-session-secret'

const user = {
  id: 'user-123',
  email: 'reader@example.test',
  createdAt: '2026-08-25T00:00:00.000Z',
  lastSignInAt: '2026-08-25T00:01:00.000Z',
}

function createAuthService(): AuthService & { revoked: string[]; updated: string[] } {
  const revoked: string[] = []
  const updated: string[] = []
  return {
    revoked,
    updated,
    signUp: async () => ({ user, tokens: null, emailConfirmationRequired: true }),
    signIn: async (email, password) => email === user.email && password === 'password-123'
      ? { user, tokens: { accessToken: 'access.one', refreshToken: 'refresh.one' } }
      : null,
    getUser: async (accessToken) => accessToken === 'access.one' || accessToken === 'access.two' ? user : null,
    refresh: async (refreshToken) => refreshToken === 'refresh.one'
      ? { user, tokens: { accessToken: 'access.two', refreshToken: 'refresh.two' } }
      : null,
    updatePassword: async (userId, password) => {
      if (userId !== user.id) return false
      updated.push(password)
      return true
    },
    revoke: async (userId) => { revoked.push(userId) },
  }
}

function emptyStore(): DocumentStore {
  return {
    list: async () => [],
    upload: async () => { throw new Error('not used') },
    getFile: async () => null,
  }
}

async function start(options: Parameters<typeof createApiServer>[1] = {}) {
  const environment = loadServerEnv({
    APP_ORIGIN: appOrigin,
    PAPERBRIDGE_SESSION_SECRET: secret,
  })
  const server = createApiServer(environment, options)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Expected an address.')
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: async () => {
      server.close()
      await once(server, 'close')
    },
  }
}

function cookieHeader(response: Response): string {
  const setCookie = response.headers.get('set-cookie')
  if (!setCookie) throw new Error('Expected auth cookies.')
  const access = new RegExp(`${ACCESS_TOKEN_COOKIE_NAME}=([^;]+)`).exec(setCookie)?.[0]
  const refresh = new RegExp(`${REFRESH_TOKEN_COOKIE_NAME}=([^;]+)`).exec(setCookie)?.[0]
  if (!access || !refresh) throw new Error('Expected access and refresh cookies.')
  return `${access}; ${refresh}`
}

function jsonHeaders(cookie?: string): Record<string, string> {
  return {
    origin: appOrigin,
    'content-type': 'application/json',
    ...(cookie ? { cookie } : {}),
  }
}

describe('PaperBridge server auth boundary', () => {
  it('keeps tokens out of JSON, puts them in strict HttpOnly cookies, and returns only a public profile', async () => {
    const authService = createAuthService()
    const server = await start({ authService })
    try {
      const login = await fetch(`${server.origin}/api/auth/login`, {
        method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ email: user.email, password: 'password-123' }),
      })
      expect(login.status).toBe(200)
      const text = await login.text()
      expect(text).toContain(user.email)
      expect(text).not.toContain('access.one')
      expect(text).not.toContain('refresh.one')
      expect(text).not.toContain(user.id)
      expect(login.headers.get('set-cookie')).toContain('HttpOnly')
      expect(login.headers.get('set-cookie')).toContain('SameSite=Strict')

      const session = await fetch(`${server.origin}/api/auth/session`, { headers: { cookie: cookieHeader(login) } })
      expect(await session.json()).toEqual({ user: { email: user.email, createdAt: user.createdAt, lastSignInAt: user.lastSignInAt } })
    } finally {
      await server.close()
    }
  })

  it('uses a stable HMAC namespace for an authenticated account while preserving anonymous data separately', async () => {
    const authService = createAuthService()
    const seenNamespaces: string[] = []
    const server = await start({
      authService,
      documentStoreForSession: (namespace) => {
        seenNamespaces.push(namespace)
        return emptyStore()
      },
    })
    try {
      const anonymous = await fetch(`${server.origin}/api/documents`)
      const anonymousCookie = anonymous.headers.get('set-cookie')?.split(';', 1)[0]
      expect(anonymousCookie).toBeTruthy()

      const firstLogin = await fetch(`${server.origin}/api/auth/login`, {
        method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ email: user.email, password: 'password-123' }),
      })
      const secondLogin = await fetch(`${server.origin}/api/auth/login`, {
        method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ email: user.email, password: 'password-123' }),
      })
      await fetch(`${server.origin}/api/documents`, { headers: { cookie: cookieHeader(firstLogin) } })
      await fetch(`${server.origin}/api/documents`, { headers: { cookie: cookieHeader(secondLogin) } })

      const namespace = storageNamespaceForUser(user.id, secret)
      expect(namespace).toHaveLength(32)
      expect(seenNamespaces).toEqual([expect.not.stringMatching(namespace), namespace, namespace])
      // The anonymous namespace has no migration path: signing in simply uses
      // the separate deterministic account namespace from this point onward.
      expect(seenNamespaces[0]).not.toBe(namespace)
    } finally {
      await server.close()
    }
  })

  it('refreshes expired access cookies, clears tampered cookies, and supports authenticated password/logout operations', async () => {
    const authService = createAuthService()
    const server = await start({ authService })
    try {
      const refreshed = await fetch(`${server.origin}/api/auth/session`, {
        headers: { cookie: `${ACCESS_TOKEN_COOKIE_NAME}=expired; ${REFRESH_TOKEN_COOKIE_NAME}=refresh.one` },
      })
      expect(refreshed.status).toBe(200)
      expect(refreshed.headers.get('set-cookie')).toContain(`${ACCESS_TOKEN_COOKIE_NAME}=access.two`)

      const tampered = await fetch(`${server.origin}/api/auth/session`, {
        headers: { cookie: `${ACCESS_TOKEN_COOKIE_NAME}=not*valid; ${REFRESH_TOKEN_COOKIE_NAME}=refresh.one` },
      })
      expect(await tampered.json()).toEqual({ user: null })
      expect(tampered.headers.get('set-cookie')).toContain('Max-Age=0')

      const cookie = `${ACCESS_TOKEN_COOKIE_NAME}=access.one; ${REFRESH_TOKEN_COOKIE_NAME}=refresh.one`
      const password = await fetch(`${server.origin}/api/auth/password`, {
        method: 'PUT', headers: jsonHeaders(cookie), body: JSON.stringify({ password: 'new-password-123' }),
      })
      expect(password.status).toBe(200)
      expect(await password.json()).toEqual({ updated: true })
      expect(authService.updated).toEqual(['new-password-123'])

      const logout = await fetch(`${server.origin}/api/auth/session`, { method: 'DELETE', headers: { origin: appOrigin, cookie } })
      expect(logout.status).toBe(204)
      expect(authService.revoked).toEqual([user.id])
      expect(logout.headers.get('set-cookie')).toContain('Max-Age=0')
    } finally {
      await server.close()
    }
  })

  it('rejects invalid shapes, generic bad credentials, excessive attempts, and unconfigured auth without exposing service details', async () => {
    const authService = createAuthService()
    const server = await start({ authService, authRateLimiter: new InMemoryAuthRateLimiter(2) })
    try {
      const invalid = await fetch(`${server.origin}/api/auth/login`, {
        method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ email: user.email, password: 'password-123', extra: true }),
      })
      expect(invalid.status).toBe(400)
      const badCredentials = await fetch(`${server.origin}/api/auth/login`, {
        method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ email: user.email, password: 'wrong-password' }),
      })
      expect(badCredentials.status).toBe(401)
      expect(await badCredentials.text()).not.toContain('Supabase')
      const limited = await fetch(`${server.origin}/api/auth/login`, {
        method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ email: user.email, password: 'wrong-password' }),
      })
      expect(limited.status).toBe(429)

      const unsupportedMethod = await fetch(`${server.origin}/api/auth/password`, { headers: { origin: appOrigin } })
      expect(unsupportedMethod.status).toBe(404)
      expect(await unsupportedMethod.json()).toEqual({ error: '요청한 항목을 찾을 수 없습니다.' })
    } finally {
      await server.close()
    }

    const unconfigured = await start({ documents: emptyStore() })
    try {
      const response = await fetch(`${unconfigured.origin}/api/auth/session`)
      expect(response.status).toBe(503)
      expect(response.headers.get('set-cookie')).toContain('Max-Age=0')
    } finally {
      await unconfigured.close()
    }
  })
})
