import { describe, expect, it } from 'vitest'
import {
  MAX_SSE_BUFFER_BYTES,
  MAX_SSE_EVENT_BYTES,
  MAX_SSE_RESPONSE_BYTES,
  OPENROUTER_CHAT_COMPLETIONS_URL,
  OpenRouterAdapter,
  parseSseData,
  type OpenRouterFetch,
} from './openrouter.js'

const providerKey = 'sk-or-v1-openrouter-key-that-must-not-appear-in-events'
const runInput = {
  apiKey: providerKey,
  modelId: 'openai/gpt-4o-mini',
  messages: [{ role: 'user' as const, content: 'Summarize the selected passage.' }],
}

async function* chunks(...parts: string[]): AsyncGenerator<Uint8Array> {
  for (const part of parts) yield Buffer.from(part)
}

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const values: T[] = []
  for await (const value of iterable) values.push(value)
  return values
}

describe('OpenRouterAdapter', () => {
  it('posts a streaming OpenRouter request and normalizes fragmented SSE deltas, usage, and done', async () => {
    let capturedUrl = ''
    let capturedInit: Parameters<OpenRouterFetch>[1] | undefined
    const fetch: OpenRouterFetch = async (url, init) => {
      capturedUrl = url
      capturedInit = init
      return {
        ok: true,
        status: 200,
        body: chunks(
          'data: {"choices":[{"delta":{"content":"Hel',
          'lo"}}]}\n\n',
          'data: {"choices":[{"delta":{"content":" world"}}]}\n\n',
          'data: {"choices":[{"finish_reason":"stop"}],"usage":{"prompt_tokens":4,"completion_tokens":2,"total_tokens":6}}\n\n',
          'data: [DONE]\n\n',
        ),
      }
    }
    const adapter = new OpenRouterAdapter({ fetch })

    const events = await collect(adapter.stream({ ...runInput, metadata: { documentId: 'doc-1', apiKey: providerKey } }))
    expect(capturedUrl).toBe(OPENROUTER_CHAT_COMPLETIONS_URL)
    expect(capturedInit?.method).toBe('POST')
    expect(capturedInit?.headers.authorization).toBe(`Bearer ${providerKey}`)
    expect(JSON.parse(capturedInit?.body ?? '{}')).toMatchObject({ stream: true, max_tokens: 1024 })
    expect(events.map((event) => event.type)).toEqual(['started', 'text-delta', 'text-delta', 'result', 'done'])
    expect(events[1]).toMatchObject({ type: 'text-delta', delta: 'Hello' })
    expect(events[2]).toMatchObject({ type: 'text-delta', delta: ' world' })
    expect(events[3]).toMatchObject({ type: 'result', text: 'Hello world', finishReason: 'stop', usage: { inputTokens: 4, outputTokens: 2, totalTokens: 6 } })
    expect(JSON.stringify(events)).not.toContain(providerKey)
  })

  it('parses multiline SSE data fields across chunks', async () => {
    await expect(collect(parseSseData(chunks('data: first\nda', 'ta: second\n\n')))).resolves.toEqual(['first\nsecond'])
  })

  it('allowlists only a canonical document id in emitted request metadata', async () => {
    const metadataSecret = 'metadata-secret-that-must-not-leak'
    const adapter = new OpenRouterAdapter({
      fetch: async () => ({ ok: true, status: 200, body: chunks('data: [DONE]\n\n') }),
    })

    const events = await collect(adapter.stream({
      ...runInput,
      metadata: {
        documentId: '123e4567-e89b-12d3-a456-426614174000',
        key: metadataSecret,
        apiKey: metadataSecret,
        accessToken: metadataSecret,
        authorization: metadataSecret,
        secret: metadataSecret,
        documentTitle: metadataSecret,
      },
    }))
    expect(events[0]).toMatchObject({
      type: 'started',
      metadata: {
        documentId: '123e4567-e89b-12d3-a456-426614174000',
        provider: 'openrouter',
        modelId: 'openai/gpt-4o-mini',
      },
    })
    expect(JSON.stringify(events)).not.toContain(metadataSecret)
  })

  it('sanitizes upstream stream errors and stops with an error and done event', async () => {
    const adapter = new OpenRouterAdapter({
      fetch: async () => ({
        ok: true,
        status: 200,
        body: chunks('data: {"error":{"message":"raw upstream error with sk-or-v1-secret"}}\n\n', 'data: [DONE]\n\n'),
      }),
    })

    const events = await collect(adapter.stream(runInput))
    expect(events.map((event) => event.type)).toEqual(['started', 'error', 'done'])
    expect(events[1]).toMatchObject({ type: 'error', error: { code: 'provider_error', message: '제공자 요청을 처리하지 못했습니다.' } })
    expect(JSON.stringify(events)).not.toContain('raw upstream error')
    expect(JSON.stringify(events)).not.toContain(providerKey)
  })

  it('reports cancellation and bounded timeouts without propagating fetch errors', async () => {
    const cancellation = new AbortController()
    const cancelledAdapter = new OpenRouterAdapter({
      fetch: async (_url, init) => ({
        ok: true,
        status: 200,
        body: {
          async *[Symbol.asyncIterator]() {
            await new Promise<void>((resolve) => init.signal.addEventListener('abort', () => resolve(), { once: true }))
            yield new Uint8Array()
            throw new Error('raw cancelled fetch error')
          },
        },
      }),
    })
    const cancelledRun = collect(cancelledAdapter.stream({ ...runInput, signal: cancellation.signal }))
    setTimeout(() => cancellation.abort(), 5)
    const cancelled = await cancelledRun
    expect(cancelled[1]).toMatchObject({ type: 'error', error: { code: 'cancelled' } })

    const timeoutAdapter = new OpenRouterAdapter({
      fetch: async (_url, init) =>
        new Promise((_, reject) => {
          init.signal.addEventListener('abort', () => reject(new Error('raw fetch abort detail')), { once: true })
        }),
    })
    const timedOut = await collect(timeoutAdapter.stream({ ...runInput, timeoutMs: 10 }))
    expect(timedOut.map((event) => event.type)).toEqual(['started', 'error', 'done'])
    expect(timedOut[1]).toMatchObject({ type: 'error', error: { code: 'timeout' } })
    expect(JSON.stringify(timedOut)).not.toContain('raw fetch abort detail')
  })

  it('does not invoke fetch when cancellation has already arrived', async () => {
    const cancellation = new AbortController()
    cancellation.abort('cancelled')
    let fetchCalls = 0
    const adapter = new OpenRouterAdapter({
      fetch: async () => {
        fetchCalls += 1
        throw new Error('transport must not be called after cancellation')
      },
    })

    const events = await collect(adapter.stream({ ...runInput, signal: cancellation.signal }))
    expect(fetchCalls).toBe(0)
    expect(events.map((event) => event.type)).toEqual(['started', 'error', 'done'])
    expect(events[1]).toMatchObject({ type: 'error', error: { code: 'cancelled' } })
    expect(JSON.stringify(events)).not.toContain(providerKey)
  })

  it('preserves a validated caller run id in normalized events', async () => {
    const runId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    const adapter = new OpenRouterAdapter({
      fetch: async () => ({ ok: true, status: 200, body: chunks('data: [DONE]\n\n') }),
    })

    const events = await collect(adapter.stream({ ...runInput, runId }))
    expect(events).not.toHaveLength(0)
    expect(events.every((event) => event.runId === runId)).toBe(true)
  })

  it('performs a bounded, stateless one-token key test', async () => {
    let capturedBody = ''
    const adapter = new OpenRouterAdapter({
      fetch: async (_url, init) => {
        capturedBody = init.body
        return { ok: true, status: 200, json: async () => ({ id: 'gen-test', choices: [{ message: { content: 'OK' } }] }) }
      },
    })

    const result = await adapter.testKey({ apiKey: providerKey, modelId: 'openai/gpt-4o-mini', timeoutMs: 100 })
    expect(result.ok).toBe(true)
    expect(JSON.parse(capturedBody)).toMatchObject({ stream: false, max_tokens: 1, temperature: 0 })
    expect(JSON.stringify(result)).not.toContain(providerKey)
  })

  it('rejects a successful HTTP health response with an invalid OpenRouter JSON shape', async () => {
    const adapter = new OpenRouterAdapter({
      fetch: async () => ({ ok: true, status: 200, json: async () => ({ id: 'gen-test', choices: [] }) }),
    })

    const result = await adapter.testKey({ apiKey: providerKey, modelId: 'openai/gpt-4o-mini' })
    expect(result).toMatchObject({ ok: false, error: { code: 'provider_protocol' } })
    expect(result.error?.message).toMatch(/[가-힣]/)
    expect(JSON.stringify(result)).not.toContain(providerKey)
  })

  it('enforces output caps without emitting a partial result', async () => {
    const adapter = new OpenRouterAdapter({
      fetch: async () => ({
        ok: true,
        status: 200,
        body: chunks('data: {"choices":[{"delta":{"content":"four"}}]}\n\n', 'data: [DONE]\n\n'),
      }),
    })

    const events = await collect(adapter.stream({ ...runInput, maxOutputChars: 3 }))
    expect(events.map((event) => event.type)).toEqual(['started', 'error', 'done'])
    expect(events[1]).toMatchObject({ type: 'error', error: { code: 'output_limit' } })
  })

  it('aborts and reports a sanitized error for oversized SSE frames and unterminated buffers', async () => {
    for (const body of [
      chunks(`data: {"padding":"${'x'.repeat(MAX_SSE_EVENT_BYTES)}"}\n\n`),
      chunks(`data: ${'x'.repeat(MAX_SSE_BUFFER_BYTES + 1)}`),
    ]) {
      let signal: AbortSignal | undefined
      const adapter = new OpenRouterAdapter({
        fetch: async (_url, init) => {
          signal = init.signal
          return { ok: true, status: 200, body }
        },
      })
      const events = await collect(adapter.stream(runInput))
      expect(events.map((event) => event.type)).toEqual(['started', 'error', 'done'])
      expect(events[1]).toMatchObject({ type: 'error', error: { code: 'output_limit' } })
      expect(signal?.aborted).toBe(true)
    }
  })

  it('caps total raw response and decoded output bytes before returning a result', async () => {
    const padding = 'x'.repeat(MAX_SSE_EVENT_BYTES - 64)
    let rawSignal: AbortSignal | undefined
    const rawAdapter = new OpenRouterAdapter({
      fetch: async (_url, init) => {
        rawSignal = init.signal
        return { ok: true, status: 200, body: chunks(...Array.from({ length: 9 }, () => `data: {"padding":"${padding}"}\n\n`)) }
      },
    })
    const rawEvents = await collect(rawAdapter.stream(runInput))
    expect(rawEvents[1]).toMatchObject({ type: 'error', error: { code: 'output_limit' } })
    expect(rawSignal?.aborted).toBe(true)
    expect(MAX_SSE_RESPONSE_BYTES).toBeLessThan(9 * Buffer.byteLength(`data: {"padding":"${padding}"}\n\n`))

    const delta = '가'.repeat(16_000)
    let outputSignal: AbortSignal | undefined
    const outputAdapter = new OpenRouterAdapter({
      fetch: async (_url, init) => {
        outputSignal = init.signal
        return {
          ok: true,
          status: 200,
          body: chunks(...Array.from({ length: 6 }, () => `data: {"choices":[{"delta":{"content":"${delta}"}}]}\n\n`)),
        }
      },
    })
    const outputEvents = await collect(outputAdapter.stream({ ...runInput, maxOutputChars: 100_000 }))
    expect(outputEvents.at(-2)).toMatchObject({ type: 'error', error: { code: 'output_limit' } })
    expect(outputSignal?.aborted).toBe(true)
  })
})
