import { describe, expect, it, vi } from 'vitest'
import { createAuthClient, type AuthFetch } from './auth'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function responses(...items: Response[]): AuthFetch {
  return vi.fn(async () => items.shift() ?? json({ error: 'unexpected' }, 500))
}

const profile = {
  email: 'reader@example.test',
  createdAt: '2026-08-25T00:00:00.000Z',
  lastSignInAt: null,
}

describe('auth client', () => {
  it('uses same-origin credentials and accepts only public profile responses', async () => {
    const fetcher = responses(json({ user: profile }))
    await expect(createAuthClient(fetcher).login({ email: profile.email, password: 'password-123' })).resolves.toEqual(profile)
    expect(fetcher).toHaveBeenCalledWith('/api/auth/login', expect.objectContaining({
      method: 'POST',
      credentials: 'same-origin',
      body: JSON.stringify({ email: profile.email, password: 'password-123' }),
    }))
  })

  it('rejects secret-bearing or malformed response envelopes before they can reach a page', async () => {
    const secretBearing = createAuthClient(responses(json({ user: { ...profile, access_token: 'never-render' } })))
    await expect(secretBearing.getSession()).rejects.toThrow('올바르지 않은 계정 응답')

    const malformed = createAuthClient(responses(json({ user: { email: profile.email, createdAt: 'not-a-date', lastSignInAt: null } })))
    await expect(malformed.getSession()).rejects.toThrow('올바르지 않은 계정 응답')
  })

  it('does not read server error bodies and forwards abort signals', async () => {
    const generic = createAuthClient(responses(json({ error: 'a secret upstream error' }, 503)))
    await expect(generic.getSession()).rejects.toThrow('계정 요청을 완료하지 못했습니다')

    const controller = new AbortController()
    const fetcher = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
    })) as AuthFetch
    const pending = createAuthClient(fetcher).getSession(controller.signal)
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetcher).toHaveBeenCalledWith('/api/auth/session', expect.objectContaining({ signal: controller.signal, credentials: 'same-origin' }))
  })
})
