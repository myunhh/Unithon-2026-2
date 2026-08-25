import { describe, expect, it } from 'vitest'
import { Hono } from 'hono'

import { createHttpSecurityMiddleware } from './index.js'

const allowedOrigin = 'https://app.paperbridge.example'
const deniedOrigin = 'https://evil.example'

function createSecurityApp(maxBodyBytes = 16): Hono {
  const app = new Hono()

  app.use(
    '*',
    createHttpSecurityMiddleware({
      allowedOrigins: [allowedOrigin],
      maxBodyBytes,
      allowMethods: ['GET', 'POST', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization'],
    }),
  )
  app.all('/resource', (context) => context.text('ok'))

  return app
}

describe('HTTP security middleware', () => {
  it('allows an exact origin with credentialed CORS and safe headers', async () => {
    const app = new Hono()
    app.use(
      '*',
      createHttpSecurityMiddleware({
        allowedOrigins: [allowedOrigin],
        maxBodyBytes: 16,
      }),
    )
    app.get('/resource', (context) => {
      context.header('Cache-Control', 'public, max-age=3600')
      context.header('X-Content-Type-Options', 'unsafe')
      return context.text('ok')
    })

    const response = await app.request('https://api.paperbridge.example/resource', {
      headers: { Origin: allowedOrigin },
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('access-control-allow-origin')).toBe(allowedOrigin)
    expect(response.headers.get('access-control-allow-credentials')).toBe('true')
    expect(response.headers.get('access-control-allow-origin')).not.toBe('*')
    expect(response.headers.get('vary')).toContain('Origin')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('x-frame-options')).toBe('DENY')
    expect(response.headers.get('referrer-policy')).toBe('no-referrer')
    expect(response.headers.get('strict-transport-security')).toBe(
      'max-age=31536000; includeSubDomains',
    )
  })

  it('rejects an origin that is not an exact allowlist entry', async () => {
    const app = createSecurityApp()

    const response = await app.request('https://api.paperbridge.example/resource', {
      headers: { Origin: deniedOrigin },
    })

    expect(response.status).toBe(403)
    expect(response.headers.get('access-control-allow-origin')).toBeNull()
    expect(response.headers.get('access-control-allow-credentials')).toBeNull()
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({ code: 'origin_not_allowed' })
  })

  it('responds to an allowed preflight without wildcard credentials', async () => {
    const app = createSecurityApp()

    const response = await app.request('https://api.paperbridge.example/resource', {
      method: 'OPTIONS',
      headers: {
        Origin: allowedOrigin,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type, Authorization',
      },
    })

    expect(response.status).toBe(204)
    expect(response.headers.get('access-control-allow-origin')).toBe(allowedOrigin)
    expect(response.headers.get('access-control-allow-credentials')).toBe('true')
    expect(response.headers.get('access-control-allow-methods')).toBe('GET, POST, OPTIONS')
    expect(response.headers.get('access-control-allow-headers')).toBe('Content-Type, Authorization')
    expect(response.headers.get('access-control-allow-origin')).not.toBe('*')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.text()).toBe('')
  })

  it('rejects a denied preflight before routing', async () => {
    const app = createSecurityApp()

    const response = await app.request('https://api.paperbridge.example/resource', {
      method: 'OPTIONS',
      headers: {
        Origin: deniedOrigin,
        'Access-Control-Request-Method': 'POST',
      },
    })

    expect(response.status).toBe(403)
    expect(response.headers.get('access-control-allow-origin')).toBeNull()
    expect(await response.json()).toEqual({ code: 'origin_not_allowed' })
  })

  it('rejects a request body above the injected strict limit without routing or echoing it', async () => {
    const app = new Hono()
    let routeCalled = false
    app.use(
      '*',
      createHttpSecurityMiddleware({
        allowedOrigins: [allowedOrigin],
        maxBodyBytes: 16,
      }),
    )
    app.post('/resource', (context) => {
      routeCalled = true
      return context.text('accepted')
    })

    const secretBody = 'Authorization=Bearer secret-token; PDF=/private/paper.pdf; prompt=private'
    const response = await app.request('https://api.paperbridge.example/resource', {
      method: 'POST',
      headers: {
        Origin: allowedOrigin,
        'Content-Length': String(secretBody.length),
      },
      body: secretBody,
    })

    expect(response.status).toBe(413)
    expect(routeCalled).toBe(false)
    const serialized = await response.text()
    expect(JSON.parse(serialized)).toEqual({ code: 'payload_too_large' })
    expect(serialized).not.toContain('secret-token')
    expect(serialized).not.toContain('/private/paper.pdf')
    expect(serialized).not.toContain('private')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
  })

  it('rejects actual bytes over the limit when Content-Length understates the body', async () => {
    const app = new Hono()
    let routeCalled = false
    let deliveredBody: string | undefined
    app.use(
      '*',
      createHttpSecurityMiddleware({
        allowedOrigins: [allowedOrigin],
        maxBodyBytes: 4,
      }),
    )
    app.post('/resource', async (context) => {
      routeCalled = true
      deliveredBody = await context.req.text()
      return context.text('accepted')
    })

    const response = await app.request('https://api.paperbridge.example/resource', {
      method: 'POST',
      headers: {
        Origin: allowedOrigin,
        'Content-Length': '1',
        'Content-Type': 'text/plain',
      },
      body: '0123456789',
    })

    expect(response.status).toBe(413)
    expect(routeCalled).toBe(false)
    expect(deliveredBody).toBeUndefined()
    const serialized = await response.text()
    expect(JSON.parse(serialized)).toEqual({ code: 'payload_too_large' })
    expect(serialized).not.toContain('0123456789')
  })

  it('rejects actual bytes over the limit when Content-Length is absent', async () => {
    const app = new Hono()
    let routeCalled = false
    let deliveredBody: string | undefined
    app.use(
      '*',
      createHttpSecurityMiddleware({
        allowedOrigins: [allowedOrigin],
        maxBodyBytes: 4,
      }),
    )
    app.post('/resource', async (context) => {
      routeCalled = true
      deliveredBody = await context.req.text()
      return context.text('accepted')
    })

    const response = await app.request('https://api.paperbridge.example/resource', {
      method: 'POST',
      headers: {
        Origin: allowedOrigin,
        'Content-Type': 'text/plain',
      },
      body: '0123456789',
    })

    expect(response.status).toBe(413)
    expect(routeCalled).toBe(false)
    expect(deliveredBody).toBeUndefined()
    expect(JSON.parse(await response.text())).toEqual({ code: 'payload_too_large' })
  })

  it('preserves an in-limit body for the downstream route after inspection', async () => {
    const app = new Hono()
    let deliveredBody: string | undefined
    app.use(
      '*',
      createHttpSecurityMiddleware({
        allowedOrigins: [allowedOrigin],
        maxBodyBytes: 4,
      }),
    )
    app.post('/resource', async (context) => {
      deliveredBody = await context.req.text()
      return context.text('accepted')
    })

    const response = await app.request('https://api.paperbridge.example/resource', {
      method: 'POST',
      headers: {
        Origin: allowedOrigin,
        'Content-Length': '4',
        'Content-Type': 'text/plain',
      },
      body: '0123',
    })

    expect(response.status).toBe(200)
    expect(deliveredBody).toBe('0123')
    expect(await response.text()).toBe('accepted')
  })

  it('fails fast for wildcard origins and unusable body limits', () => {
    expect(() =>
      createHttpSecurityMiddleware({
        allowedOrigins: ['*'],
        maxBodyBytes: 16,
      }),
    ).toThrowError(RangeError)

    expect(() =>
      createHttpSecurityMiddleware({
        allowedOrigins: [allowedOrigin],
        maxBodyBytes: 0,
      }),
    ).toThrowError(RangeError)
  })
})
