import type { User } from '@supabase/supabase-js'
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { ServerEnv } from './env.js'
import { createServerSupabaseClient } from './supabase.js'
import { appendSetCookie, cookiesFrom, storageNamespaceForUser } from './session.js'

export const ACCESS_TOKEN_COOKIE_NAME = 'paperbridge_access_token'
export const REFRESH_TOKEN_COOKIE_NAME = 'paperbridge_refresh_token'
const ACCESS_TOKEN_MAX_AGE_SECONDS = 60 * 60
const REFRESH_TOKEN_MAX_AGE_SECONDS = 60 * 60 * 24 * 30
const MAX_AUTH_COOKIE_TOKEN_LENGTH = 8 * 1024

export type AuthProfile = Readonly<{
  email: string
  createdAt: string | null
  lastSignInAt: string | null
}>

type AuthenticatedUser = AuthProfile & Readonly<{ id: string }>

export type AuthTokens = Readonly<{
  accessToken: string
  refreshToken: string
}>

export type AuthSession = Readonly<{
  user: AuthenticatedUser
  tokens: AuthTokens
}>

export type SignupResult = Readonly<{
  user: AuthenticatedUser
  tokens: AuthTokens | null
  emailConfirmationRequired: boolean
}>

/**
 * Narrow seam around Supabase Auth. It makes tests deterministic and ensures
 * the HTTP layer never serializes a Supabase session or error object.
 */
export interface AuthService {
  signUp(email: string, password: string): Promise<SignupResult | null>
  signIn(email: string, password: string): Promise<AuthSession | null>
  getUser(accessToken: string): Promise<AuthenticatedUser | null>
  refresh(refreshToken: string): Promise<AuthSession | null>
  updatePassword(userId: string, password: string): Promise<boolean>
  revoke(userId: string): Promise<void>
}

export type AuthenticatedRequest = Readonly<{
  user: AuthenticatedUser
  storageNamespace: string
}>

/** An intentionally bounded fixed-window limiter; it never records emails. */
export interface AuthRateLimiter {
  consume(action: 'login' | 'signup', remoteAddress: string): boolean
}

type RateLimitEntry = { count: number; resetAt: number }

export class InMemoryAuthRateLimiter implements AuthRateLimiter {
  readonly #entries = new Map<string, RateLimitEntry>()

  constructor(
    private readonly limit = 8,
    private readonly windowMs = 10 * 60 * 1000,
    private readonly maxEntries = 4096,
    private readonly now: () => number = Date.now,
  ) {}

  consume(action: 'login' | 'signup', remoteAddress: string): boolean {
    const now = this.now()
    for (const [key, entry] of this.#entries) {
      if (entry.resetAt <= now) this.#entries.delete(key)
    }
    const key = `${action}:${remoteAddress}`
    const current = this.#entries.get(key)
    if (current && current.resetAt > now) {
      if (current.count >= this.limit) return false
      current.count += 1
      return true
    }
    if (!current && this.#entries.size >= this.maxEntries) {
      const oldest = this.#entries.keys().next().value
      if (oldest) this.#entries.delete(oldest)
    }
    this.#entries.set(key, { count: 1, resetAt: now + this.windowMs })
    return true
  }
}

function profileFromUser(user: User): AuthenticatedUser | null {
  if (typeof user.id !== 'string' || user.id.length < 1 || user.id.length > 256 || typeof user.email !== 'string' || !isValidEmail(user.email)) {
    return null
  }
  return {
    id: user.id,
    email: user.email,
    createdAt: validTimestamp(user.created_at) ? user.created_at : null,
    lastSignInAt: validTimestamp(user.last_sign_in_at) ? user.last_sign_in_at : null,
  }
}

function tokensFrom(value: { access_token?: unknown; refresh_token?: unknown }): AuthTokens | null {
  if (!isBoundedToken(value.access_token) || !isBoundedToken(value.refresh_token)) return null
  return { accessToken: value.access_token, refreshToken: value.refresh_token }
}

/** A fresh non-persistent client is constructed for every operation below. */
export function createSupabaseAuthService(environment: ServerEnv): AuthService | null {
  if (!environment.supabase) return null

  return {
    async signUp(email, password) {
      const client = createServerSupabaseClient(environment)
      if (!client) return null
      try {
        const { data, error } = await client.auth.signUp({ email, password })
        if (error || !data.user) return null
        const user = profileFromUser(data.user)
        if (!user) return null
        const tokens = data.session ? tokensFrom(data.session) : null
        return { user, tokens, emailConfirmationRequired: !tokens }
      } catch {
        return null
      }
    },

    async signIn(email, password) {
      const client = createServerSupabaseClient(environment)
      if (!client) return null
      try {
        const { data, error } = await client.auth.signInWithPassword({ email, password })
        if (error || !data.user || !data.session) return null
        const user = profileFromUser(data.user)
        const tokens = tokensFrom(data.session)
        return user && tokens ? { user, tokens } : null
      } catch {
        return null
      }
    },

    async getUser(accessToken) {
      const client = createServerSupabaseClient(environment)
      if (!client) return null
      try {
        const { data, error } = await client.auth.getUser(accessToken)
        return error || !data.user ? null : profileFromUser(data.user)
      } catch {
        return null
      }
    },

    async refresh(refreshToken) {
      const client = createServerSupabaseClient(environment)
      if (!client) return null
      try {
        const { data, error } = await client.auth.refreshSession({ refresh_token: refreshToken })
        if (error || !data.user || !data.session) return null
        const user = profileFromUser(data.user)
        const tokens = tokensFrom(data.session)
        return user && tokens ? { user, tokens } : null
      } catch {
        return null
      }
    },

    async updatePassword(userId, password) {
      const client = createServerSupabaseClient(environment)
      if (!client) return false
      try {
        const { error } = await client.auth.admin.updateUserById(userId, { password })
        return !error
      } catch {
        return false
      }
    },

    async revoke(userId) {
      const client = createServerSupabaseClient(environment)
      if (!client) return
      try {
        await client.auth.admin.signOut(userId, 'global')
      } catch {
        // Logout is intentionally best effort. Cookies are always cleared.
      }
    },
  }
}

export function createDevelopmentAuthService(): AuthService {
  type StoredUser = { user: AuthenticatedUser; salt: Buffer; passwordHash: Buffer }
  const usersByEmail = new Map<string, StoredUser>()
  const usersById = new Map<string, StoredUser>()
  const accessTokens = new Map<string, string>()
  const refreshTokens = new Map<string, string>()

  const issueSession = (stored: StoredUser): AuthSession => {
    const accessToken = randomBytes(32).toString('base64url')
    const refreshToken = randomBytes(32).toString('base64url')
    accessTokens.set(accessToken, stored.user.id)
    refreshTokens.set(refreshToken, stored.user.id)
    return { user: stored.user, tokens: { accessToken, refreshToken } }
  }

  const replaceUser = (stored: StoredUser, user: AuthenticatedUser): StoredUser => {
    const next = { ...stored, user }
    usersByEmail.set(user.email.toLowerCase(), next)
    usersById.set(user.id, next)
    return next
  }

  return {
    async signUp(email, password) {
      const normalizedEmail = email.toLowerCase()
      if (usersByEmail.has(normalizedEmail)) return null
      const salt = randomBytes(16)
      const timestamp = new Date().toISOString()
      const stored: StoredUser = {
        user: { id: randomUUID(), email: normalizedEmail, createdAt: timestamp, lastSignInAt: timestamp },
        salt,
        passwordHash: scryptSync(password, salt, 32),
      }
      usersByEmail.set(normalizedEmail, stored)
      usersById.set(stored.user.id, stored)
      const session = issueSession(stored)
      return { user: stored.user, tokens: session.tokens, emailConfirmationRequired: false }
    },
    async signIn(email, password) {
      const stored = usersByEmail.get(email.toLowerCase())
      if (!stored || !timingSafeEqual(stored.passwordHash, scryptSync(password, stored.salt, 32))) return null
      const current = replaceUser(stored, { ...stored.user, lastSignInAt: new Date().toISOString() })
      return issueSession(current)
    },
    async getUser(accessToken) {
      const userId = accessTokens.get(accessToken)
      return userId ? usersById.get(userId)?.user ?? null : null
    },
    async refresh(refreshToken) {
      const userId = refreshTokens.get(refreshToken)
      if (!userId) return null
      refreshTokens.delete(refreshToken)
      const stored = usersById.get(userId)
      return stored ? issueSession(stored) : null
    },
    async updatePassword(userId, password) {
      const stored = usersById.get(userId)
      if (!stored) return false
      const salt = randomBytes(16)
      replaceUser(stored, { ...stored.user })
      const next = { ...stored, salt, passwordHash: scryptSync(password, salt, 32) }
      usersByEmail.set(stored.user.email.toLowerCase(), next)
      usersById.set(userId, next)
      return true
    },
    async revoke(userId) {
      for (const [token, tokenUserId] of accessTokens) if (tokenUserId === userId) accessTokens.delete(token)
      for (const [token, tokenUserId] of refreshTokens) if (tokenUserId === userId) refreshTokens.delete(token)
    },
  }
}

export function publicProfile(user: AuthenticatedUser): AuthProfile {
  return { email: user.email, createdAt: user.createdAt, lastSignInAt: user.lastSignInAt }
}

export function isValidEmail(value: unknown): value is string {
  return typeof value === 'string'
    && value.length >= 3
    && value.length <= 320
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

export function isValidPassword(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const length = Array.from(value).length
  return length >= 10 && length <= 128
}

export function remoteAddressFor(request: IncomingMessage): string {
  const address = request.socket.remoteAddress ?? 'unknown'
  return /^[A-Fa-f0-9:.]{1,128}$/.test(address) ? address : 'unknown'
}

export function applyAuthCookies(response: ServerResponse, tokens: AuthTokens, environment: ServerEnv): void {
  appendSetCookie(response, serializeAuthCookie(ACCESS_TOKEN_COOKIE_NAME, tokens.accessToken, ACCESS_TOKEN_MAX_AGE_SECONDS, environment))
  appendSetCookie(response, serializeAuthCookie(REFRESH_TOKEN_COOKIE_NAME, tokens.refreshToken, REFRESH_TOKEN_MAX_AGE_SECONDS, environment))
}

export function clearAuthCookies(response: ServerResponse, environment: ServerEnv): void {
  appendSetCookie(response, serializeAuthCookie(ACCESS_TOKEN_COOKIE_NAME, '', 0, environment))
  appendSetCookie(response, serializeAuthCookie(REFRESH_TOKEN_COOKIE_NAME, '', 0, environment))
}

export async function authenticatedRequestFrom(
  request: IncomingMessage,
  response: ServerResponse,
  environment: ServerEnv,
  service: AuthService | null,
): Promise<AuthenticatedRequest | null> {
  const cookies = cookiesFrom(request)
  const access = cookies.get(ACCESS_TOKEN_COOKIE_NAME)
  const refresh = cookies.get(REFRESH_TOKEN_COOKIE_NAME)
  const hasAuthCookie = access !== undefined || refresh !== undefined

  if ((access !== undefined && !isBoundedToken(access)) || (refresh !== undefined && !isBoundedToken(refresh))) {
    clearAuthCookies(response, environment)
    return null
  }
  if (!hasAuthCookie) return null
  if (!service) {
    clearAuthCookies(response, environment)
    return null
  }

  if (access) {
    const user = await service.getUser(access)
    if (user) return identityForUser(user, environment)
  }
  if (refresh) {
    const refreshed = await service.refresh(refresh)
    if (refreshed) {
      applyAuthCookies(response, refreshed.tokens, environment)
      return identityForUser(refreshed.user, environment)
    }
  }

  clearAuthCookies(response, environment)
  return null
}

function identityForUser(user: AuthenticatedUser, environment: ServerEnv): AuthenticatedRequest {
  return { user, storageNamespace: storageNamespaceForUser(user.id, environment.sessionSecret) }
}

function serializeAuthCookie(name: string, value: string, maxAge: number, environment: ServerEnv): string {
  if (value && !isBoundedToken(value)) throw new Error('An auth cookie token is invalid.')
  const parts = [
    `${name}=${value}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${maxAge}`,
  ]
  if (environment.nodeEnv === 'production' || new URL(environment.appOrigin).protocol === 'https:') parts.push('Secure')
  return parts.join('; ')
}

function isBoundedToken(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= MAX_AUTH_COOKIE_TOKEN_LENGTH
    && /^[A-Za-z0-9._~-]+$/.test(value)
}

function validTimestamp(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 64 && Number.isFinite(Date.parse(value))
}
