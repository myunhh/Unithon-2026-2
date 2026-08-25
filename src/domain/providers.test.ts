import { describe, expect, it, vi } from 'vitest'
import {
  combineSettingsProviders,
  createProviderClient,
  planOpenRouterTest,
  selectedProviderLabel,
  type ProviderFetch,
} from './providers'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function fetchSequence(...responses: Response[]): ProviderFetch {
  return vi.fn(async () => responses.shift() ?? jsonResponse({ error: 'unexpected request' }, 500))
}

describe('provider client', () => {
  it('rejects malformed and secret-bearing status responses', async () => {
    const malformed = createProviderClient(fetchSequence(jsonResponse({ storageConfigured: true, openRouter: { configured: true } })))
    await expect(malformed.getStatus()).rejects.toThrow('올바르지 않은 제공자 응답')

    const secretBearing = createProviderClient(fetchSequence(jsonResponse({
      storageConfigured: true,
      openRouter: { configured: true, modelId: 'openai/gpt-4o-mini', apiKey: 'should-never-reach-ui' },
    })))
    await expect(secretBearing.getStatus()).rejects.toThrow('올바르지 않은 제공자 응답')
  })

  it('saves only the supplied candidate and returns public configuration', async () => {
    const fetcher = fetchSequence(jsonResponse({ openRouter: { configured: true, modelId: 'openai/gpt-4o-mini' } }))
    const client = createProviderClient(fetcher)

    await expect(client.saveOpenRouter({ apiKey: 'sk-or-v1-candidate', modelId: 'openai/gpt-4o-mini' })).resolves.toEqual({
      configured: true,
      modelId: 'openai/gpt-4o-mini',
    })

    expect(fetcher).toHaveBeenCalledWith('/api/providers/openrouter', expect.objectContaining({
      method: 'PUT',
      credentials: 'same-origin',
      body: JSON.stringify({ apiKey: 'sk-or-v1-candidate', modelId: 'openai/gpt-4o-mini' }),
    }))
  })

  it('tests a candidate, saved credential, or saved key with a candidate model explicitly and clears saved configuration', async () => {
    const fetcher = fetchSequence(
      jsonResponse({ openRouter: { ok: true, modelId: 'openai/gpt-4o-mini', latencyMs: 42 } }),
      jsonResponse({ openRouter: { ok: false, modelId: 'openai/gpt-4o-mini', latencyMs: 21, error: {
        code: 'authentication_failed', message: 'The provider rejected the key.', retryable: false,
      } } }, 401),
      jsonResponse({ openRouter: { ok: true, modelId: 'anthropic/claude-3.5-haiku', latencyMs: 30 } }),
      jsonResponse({ openRouter: { configured: false } }),
    )
    const client = createProviderClient(fetcher)

    await expect(client.testOpenRouter({ apiKey: 'sk-or-v1-candidate', modelId: 'openai/gpt-4o-mini' })).resolves.toMatchObject({ ok: true })
    await expect(client.testOpenRouter()).resolves.toMatchObject({ ok: false, error: { code: 'authentication_failed' } })
    await expect(client.testOpenRouter({ modelId: 'anthropic/claude-3.5-haiku' })).resolves.toMatchObject({ ok: true })
    await expect(client.clearOpenRouter()).resolves.toEqual({ configured: false })

    expect(fetcher).toHaveBeenNthCalledWith(1, '/api/providers/openrouter/test', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ apiKey: 'sk-or-v1-candidate', modelId: 'openai/gpt-4o-mini' }),
    }))
    expect(fetcher).toHaveBeenNthCalledWith(2, '/api/providers/openrouter/test', expect.objectContaining({ method: 'POST', body: '{}' }))
    expect(fetcher).toHaveBeenNthCalledWith(3, '/api/providers/openrouter/test', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ modelId: 'anthropic/claude-3.5-haiku' }),
    }))
    expect(fetcher).toHaveBeenNthCalledWith(4, '/api/providers/openrouter', expect.objectContaining({ method: 'DELETE' }))
  })

  it('uses a saved credential server-side to test an edited model without exposing the key', () => {
    expect(planOpenRouterTest(
      { apiKey: '', modelId: 'anthropic/claude-3.5-haiku' },
      { configured: true, modelId: 'openai/gpt-4o-mini' },
    )).toEqual({ kind: 'saved-model', modelId: 'anthropic/claude-3.5-haiku' })

    expect(planOpenRouterTest(
      { apiKey: '', modelId: 'openai/gpt-4o-mini' },
      { configured: true, modelId: 'openai/gpt-4o-mini' },
    )).toEqual({ kind: 'saved' })

    expect(planOpenRouterTest(
      { apiKey: 'sk-or-v1-candidate', modelId: 'anthropic/claude-3.5-haiku' },
      { configured: true, modelId: 'openai/gpt-4o-mini' },
    )).toEqual({ kind: 'candidate', candidate: { apiKey: 'sk-or-v1-candidate', modelId: 'anthropic/claude-3.5-haiku' } })
  })

  it('uses a generic request error for HTTP failures and forwards abort signals', async () => {
    const client = createProviderClient(fetchSequence(jsonResponse({ error: 'upstream detail must not be shown' }, 503)))
    await expect(client.getStatus()).rejects.toThrow('제공자 작업을 완료하지 못했습니다')

    const controller = new AbortController()
    const fetcher = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
    })) as ProviderFetch
    const pending = createProviderClient(fetcher).getStatus(controller.signal)
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetcher).toHaveBeenCalledWith('/api/providers', expect.objectContaining({ signal: controller.signal, credentials: 'same-origin' }))
  })
})

describe('settings provider combination', () => {
  it('keeps all three desktop CLIs first class and marks them unavailable on web', () => {
    const providers = combineSettingsProviders(
      { configured: true, modelId: 'openai/gpt-4o-mini' },
      false,
      [
        { providerId: 'claude-code', status: 'healthy', detected: true, authenticated: true, checkedAt: '2026-08-25T05:06:00.000Z' },
        { providerId: 'codex', status: 'limited', detected: true, authenticated: true, checkedAt: '2026-08-25T05:06:00.000Z' },
        { providerId: 'agy', status: 'healthy', detected: true, authenticated: true, checkedAt: '2026-08-25T05:06:00.000Z' },
      ],
    )

    expect(providers.map((provider) => provider.id)).toEqual(['openrouter', 'claude-code', 'codex', 'agy'])
    expect(providers.map((provider) => provider.available)).toEqual([true, false, false, false])
    expect(selectedProviderLabel(providers)).toBe('OpenRouter')
  })

  it('counts authenticated healthy and limited desktop providers, including Agy', () => {
    const providers = combineSettingsProviders(
      { configured: false },
      true,
      [
        { providerId: 'claude-code', status: 'healthy', detected: true, authenticated: true, checkedAt: '2026-08-25T05:06:00.000Z' },
        { providerId: 'codex', status: 'limited', detected: true, authenticated: true, checkedAt: '2026-08-25T05:06:00.000Z' },
        { providerId: 'agy', status: 'failed', detected: true, authenticated: true, checkedAt: '2026-08-25T05:06:00.000Z' },
      ],
    )

    expect(providers.filter((provider) => provider.available).map((provider) => provider.id)).toEqual(['claude-code', 'codex'])
    expect(selectedProviderLabel(providers)).toBe('Claude Code')
  })
})
