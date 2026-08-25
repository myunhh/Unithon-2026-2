import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { ServerEnv } from './env.js'

export const SESSION_COOKIE_NAME = 'paperbridge_session'
const SESSION_ID_BYTES = 24
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 365

export type PaperBridgeSession = {
  id: string
}

function sign(sessionId: string, secret: string): string {
  return createHmac('sha256', secret).update(sessionId).digest('base64url')
}

function validSessionId(value: string): boolean {
  return /^[A-Za-z0-9_-]{32}$/.test(value)
}

/** Deliberately small cookie parser for server-owned opaque cookie names. */
export function cookiesFrom(request: IncomingMessage): Map<string, string> {
  const cookies = new Map<string, string>()
  for (const part of request.headers.cookie?.split(';') ?? []) {
    const separator = part.indexOf('=')
    if (separator < 1) continue
    cookies.set(part.slice(0, separator).trim(), part.slice(separator + 1).trim())
  }
  return cookies
}

/**
 * Add a cookie without dropping another independently-owned cookie written by
 * the same response (for example, the access and refresh cookies).
 */
export function appendSetCookie(response: ServerResponse, cookie: string): void {
  const existing = response.getHeader('set-cookie')
  if (!existing) {
    response.setHeader('set-cookie', cookie)
    return
  }
  response.setHeader('set-cookie', Array.isArray(existing) ? [...existing, cookie] : [String(existing), cookie])
}

export function sessionIdFromCookie(value: string | undefined, secret: string): string | null {
  if (!value) return null
  const separator = value.lastIndexOf('.')
  if (separator < 1) return null

  const sessionId = value.slice(0, separator)
  const signature = value.slice(separator + 1)
  if (!validSessionId(sessionId) || !/^[A-Za-z0-9_-]{43}$/.test(signature)) return null

  const expected = sign(sessionId, secret)
  const expectedBytes = Buffer.from(expected)
  const receivedBytes = Buffer.from(signature)
  if (expectedBytes.byteLength !== receivedBytes.byteLength) return null
  return timingSafeEqual(expectedBytes, receivedBytes) ? sessionId : null
}

export function serializeSessionCookie(sessionId: string, environment: ServerEnv): string {
  const value = `${sessionId}.${sign(sessionId, environment.sessionSecret)}`
  const parts = [
    `${SESSION_COOKIE_NAME}=${value}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${SESSION_MAX_AGE_SECONDS}`,
  ]
  if (environment.nodeEnv === 'production' || new URL(environment.appOrigin).protocol === 'https:') parts.push('Secure')
  return parts.join('; ')
}

/**
 * A client never receives a bearer token. It only retains this signed, opaque
 * identifier in an HTTP-only cookie; the server scopes all persistence by it.
 */
export function readOrCreateSession(
  request: IncomingMessage,
  response: ServerResponse,
  environment: ServerEnv,
): PaperBridgeSession {
  const existing = sessionIdFromCookie(cookiesFrom(request).get(SESSION_COOKIE_NAME), environment.sessionSecret)
  if (existing) return { id: existing }

  const id = randomBytes(SESSION_ID_BYTES).toString('base64url')
  appendSetCookie(response, serializeSessionCookie(id, environment))
  return { id }
}

/**
 * Authenticated storage is isolated by a deterministic opaque namespace, not
 * the provider user id. Anonymous data intentionally remains in its old
 * signed-session namespace and is never implicitly migrated at login.
 */
export function storageNamespaceForUser(userId: string, secret: string): string {
  if (typeof userId !== 'string' || userId.length < 1 || userId.length > 256) {
    throw new Error('The authenticated user identifier is invalid.')
  }
  return createHmac('sha256', secret).update(`paperbridge:user-storage:${userId}`).digest('base64url').slice(0, 32)
}
