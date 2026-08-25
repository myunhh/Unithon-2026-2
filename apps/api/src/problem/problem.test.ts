import { describe, expect, it } from 'vitest'

import {
  ProblemError,
  mapErrorToProblem,
  toProblemResponse,
} from './index.js'

const oauthCredentialCases = [
  ['access token', 'access_token'],
  ['access token', 'accessToken'],
  ['access token', 'ACCESS_TOKEN'],
  ['access token', 'access-token'],
  ['access token', 'access token'],
  ['refresh token', 'refresh_token'],
  ['refresh token', 'refreshToken'],
  ['refresh token', 'REFRESH_TOKEN'],
  ['refresh token', 'refresh-token'],
  ['refresh token', 'refresh token'],
  ['ID token', 'id_token'],
  ['ID token', 'idToken'],
  ['ID token', 'ID_TOKEN'],
  ['ID token', 'id-token'],
  ['ID token', 'id token'],
  ['client secret', 'client_secret'],
  ['client secret', 'clientSecret'],
  ['client secret', 'CLIENT_SECRET'],
  ['client secret', 'client-secret'],
  ['client secret', 'client secret'],
  ['private key', 'private_key'],
  ['private key', 'privateKey'],
  ['private key', 'PRIVATE_KEY'],
  ['private key', 'private-key'],
  ['private key', 'private key'],
] as const

describe('problem registry', () => {
  it('maps a stable domain code to the frozen problem contract', () => {
    const error = new ProblemError({ code: 'rate_limited' })

    const problem = mapErrorToProblem(error, 'req-rate-limit-1')

    expect(problem).toMatchObject({
      type: 'https://api.paperbridge.example/problems/rate-limited',
      title: 'Too many requests',
      status: 429,
      code: 'rate_limited',
      requestId: 'req-rate-limit-1',
      retryable: true,
    })
  })

  it('redacts unsafe details, fields, metadata, and causes from public problems', () => {
    const error = new ProblemError({
      code: 'provider_unavailable',
      detail:
        'raw provider response body Authorization: Bearer bearer-secret at /Users/alice/paper.pdf; selected text and prompt leaked',
      errors: [
        {
          path: 'provider.token',
          code: 'provider_error',
          message: 'token=token-secret raw response body /tmp/provider.json',
        },
      ],
      meta: {
        authorization: 'Bearer bearer-secret',
        rawBody: 'private provider response',
        path: '/Users/alice/paper.pdf',
        retryAfterSeconds: 3,
      },
      cause: new Error('provider body contains the private PDF and model output'),
    })

    const problem = mapErrorToProblem(error, 'req-redaction-1')
    const serialized = JSON.stringify(problem)

    expect(serialized).not.toContain('bearer-secret')
    expect(serialized).not.toContain('token-secret')
    expect(serialized).not.toContain('/Users/alice/paper.pdf')
    expect(serialized).not.toContain('/tmp/provider.json')
    expect(serialized).not.toContain('private provider response')
    expect(serialized).not.toContain('model output')
    expect(problem.meta).toEqual({ retryAfterSeconds: 3 })
  })

  it('redacts quoted JSON credential fields from public detail', () => {
    const error = new ProblemError({
      code: 'invalid_request',
      detail: 'upstream failed with {"access_token":"supersecretvalue","refresh_token":"refresh-secret"}',
    })

    const problem = mapErrorToProblem(error, 'req-json-secret-1')
    const detail = problem.detail ?? ''

    expect(detail).not.toContain('supersecretvalue')
    expect(detail).not.toContain('refresh-secret')
  })

  it('redacts client and private credential key families while preserving safe detail', () => {
    const clientCredentialFixture = 'credential-fixture-client'
    const privateCredentialFixture = 'credential-fixture-private'
    const error = new ProblemError({
      code: 'invalid_request',
      detail: `request shape is invalid; {"client_secret":"${clientCredentialFixture}","private_key":"${privateCredentialFixture}"}`,
    })

    const problem = mapErrorToProblem(error, 'req-credential-families-1')
    const detail = problem.detail ?? ''

    expect(detail).toContain('request shape is invalid')
    expect(detail).not.toContain(clientCredentialFixture)
    expect(detail).not.toContain(privateCredentialFixture)
    expect(problem.requestId).toBe('req-credential-families-1')
  })

  it.each(oauthCredentialCases)(
    'redacts nested %s assignments across the %s key variant while preserving controls',
    (_family, key) => {
      const credentialFixture = `synthetic-oauth-marker-${key.replace(/[^A-Za-z0-9]/g, '-')}`
      const opaqueReference = 'opaque-reference-fixture'
      const error = new ProblemError({
        code: 'invalid_request',
        detail: `safe validation detail ${opaqueReference}; {"oauth":{"credentials":{"${key}":"${credentialFixture}"}},"client_id":"${opaqueReference}"}`,
      })

      const problem = mapErrorToProblem(error, 'req-oauth-matrix-1')
      const detail = problem.detail ?? ''

      expect(problem).toMatchObject({
        type: 'https://api.paperbridge.example/problems/invalid-request',
        title: 'Invalid request',
        status: 400,
        code: 'invalid_request',
        requestId: 'req-oauth-matrix-1',
      })
      expect(detail).toContain('safe validation detail')
      expect(detail).toContain(opaqueReference)
      expect(detail).not.toContain(credentialFixture)
    },
  )

  it('redacts Windows drive and UNC absolute paths from public detail', () => {
    const error = new ProblemError({
      code: 'invalid_request',
      detail: 'failed at C:\\Users\\alice\\private.pdf and \\\\server\\share\\private.pdf',
    })

    const problem = mapErrorToProblem(error, 'req-windows-path-1')
    const detail = problem.detail ?? ''

    expect(detail).not.toContain('C:\\Users\\alice\\private.pdf')
    expect(detail).not.toContain('\\\\server\\share\\private.pdf')
  })

  it('returns a generic internal problem for an unknown raw cause', () => {
    const error = new Error('provider response token=secret and PDF body=/tmp/file.pdf')

    const problem = mapErrorToProblem(error, 'req-unknown-1')

    expect(problem).toEqual({
      type: 'https://api.paperbridge.example/problems/internal-error',
      title: 'Internal server error',
      status: 500,
      code: 'internal_error',
      requestId: 'req-unknown-1',
    })
    expect(JSON.stringify(problem)).not.toContain('secret')
    expect(JSON.stringify(problem)).not.toContain('/tmp/file.pdf')
  })

  it('exposes a framework-neutral problem response for later route composition', () => {
    const error = new ProblemError({
      code: 'invalid_request',
      detail: 'The request shape is invalid.',
    })

    const response = toProblemResponse(error, 'req-response-1')

    expect(response.status).toBe(400)
    expect(response.headers['content-type']).toBe('application/problem+json')
    expect(response.body.code).toBe('invalid_request')
    expect(response.body.requestId).toBe('req-response-1')
  })

  it('keeps optional public fields within their contract bounds', () => {
    const errors = Array.from({ length: 101 }, (_, index) => ({
      path: `field-${index}`,
      code: 'invalid_value',
    }))
    const meta = Object.fromEntries(
      Array.from({ length: 40 }, (_, index) => [`field${index}`, index]),
    )
    const error = new ProblemError({
      code: 'invalid_request',
      detail: 'safe '.repeat(200),
      errors,
      meta,
    })

    const problem = mapErrorToProblem(error, 'req-bounds-1')

    expect(problem.detail).toHaveLength(500)
    expect(problem.errors).toHaveLength(100)
    expect(Object.keys(problem.meta ?? {}).length).toBeLessThanOrEqual(32)
  })
})
