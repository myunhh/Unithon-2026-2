import { describe, expect, it } from 'vitest'

import {
  DeterministicEventSink,
  createCorrelationContext,
  createObservability,
  createRequestContext,
  type CorrelationContext,
  type CorrelationKind,
} from './index.js'

describe('observability correlation', () => {
  it('propagates request, run, and job IDs to one structured event', () => {
    const sink = new DeterministicEventSink()
    const observability = createObservability({
      sink,
      service: 'worker',
      environment: 'test',
      now: () => new Date('2026-01-01T00:00:00.000Z'),
    })
    const request = createCorrelationContext({ requestId: 'req_test' })
    const run = request.withRun('run_test')
    const job = run.withJob('job_test')

    observability.emit({
      context: job,
      event: 'parse.completed',
      level: 'info',
      fields: { durationMs: 12, status: 'ok' },
    })

    expect(sink.events).toHaveLength(1)
    expect(sink.events[0]).toMatchObject({
      requestId: 'req_test',
      runId: 'run_test',
      jobId: 'job_test',
      event: 'parse.completed',
    })
  })

  it('generates deterministic child IDs when a factory is supplied', () => {
    const calls: CorrelationKind[] = []
    const context = createCorrelationContext(
      { requestId: 'req_test' },
      { createId: (kind) => { calls.push(kind); return `${kind}_generated` } },
    )

    expect(context.withRun().ids.runId).toBe('run_generated')
    expect(context.withJob().ids.jobId).toBe('job_generated')
    expect(calls).toEqual(['run', 'job'])
  })

  it('creates a request ID when a request context starts without one', () => {
    const context = createRequestContext(undefined, {
      createId: (kind) => `${kind}_generated`,
    })

    expect(context.ids).toEqual({ requestId: 'request_generated' })
  })

  it('records a metric through the same correlated sink seam', () => {
    const sink = new DeterministicEventSink()
    const observability = createObservability({
      sink,
      service: 'worker',
      environment: 'test',
      now: () => new Date('2026-01-01T00:00:00.000Z'),
    })

    observability.metric({
      context: { requestId: 'req_test', jobId: 'job_test' },
      name: 'queue.depth',
      value: 3,
      unit: 'jobs',
    })

    expect(sink.events[0]).toMatchObject({
      requestId: 'req_test',
      jobId: 'job_test',
      event: 'metric.queue.depth',
      fields: { value: 3, unit: 'jobs' },
    })
  })

  it('does not emit sensitive IDs supplied through plain correlation input', () => {
    const sink = new DeterministicEventSink()
    const observability = createObservability({
      sink,
      service: 'api',
      environment: 'test',
      now: () => new Date('2026-01-01T00:00:00.000Z'),
    })
    const context = createCorrelationContext({
      requestId: 'Bearer blocked-value',
      traceId: 'token_marker',
      runId: '/Users/example/private.pdf',
      jobId: 'prompt_marker',
    })

    observability.emit({
      context,
      event: 'request.completed',
      level: 'info',
      fields: { status: 'ok' },
    })

    const serialized = JSON.stringify(sink.events[0])
    expect(serialized).not.toContain('blocked-value')
    expect(serialized).not.toContain('token_marker')
    expect(serialized).not.toContain('/Users/example/private.pdf')
    expect(serialized).not.toContain('prompt_marker')
    expect(sink.events[0]).not.toHaveProperty('requestId')
    expect(sink.events[0]).not.toHaveProperty('traceId')
    expect(sink.events[0]).not.toHaveProperty('runId')
    expect(sink.events[0]).not.toHaveProperty('jobId')
  })

  it('sanitizes sensitive IDs from an external context on metric emission', () => {
    const sink = new DeterministicEventSink()
    const observability = createObservability({
      sink,
      service: 'worker',
      environment: 'test',
      now: () => new Date('2026-01-01T00:00:00.000Z'),
    })
    const externalContext: CorrelationContext = {
      ids: {
        requestId: 'req_safe',
        traceId: 'cookie_marker',
        runId: 'raw_output_marker',
        jobId: '/private/document.pdf',
      },
      child: () => createRequestContext('req_safe'),
      withRequest: () => createRequestContext('req_safe'),
      withTrace: () => createRequestContext('req_safe'),
      withRun: () => createRequestContext('req_safe'),
      withJob: () => createRequestContext('req_safe'),
    }

    expect(observability.scope(externalContext).ids).toEqual({ requestId: 'req_safe' })

    observability.metric({
      context: externalContext,
      name: 'queue.depth',
      value: 1,
    })

    const event = sink.events[0]
    const serialized = JSON.stringify(event)
    expect(serialized).not.toContain('cookie_marker')
    expect(serialized).not.toContain('raw_output_marker')
    expect(serialized).not.toContain('/private/document.pdf')
    expect(event).toMatchObject({ requestId: 'req_safe', fields: { value: 1 } })
    expect(event).not.toHaveProperty('traceId')
    expect(event).not.toHaveProperty('runId')
    expect(event).not.toHaveProperty('jobId')
  })
})

describe('observability field safety', () => {
  it('omits forbidden keys and redacts forbidden string values recursively', () => {
    const sink = new DeterministicEventSink()
    const observability = createObservability({
      sink,
      service: 'api',
      environment: 'test',
      now: () => new Date('2026-01-01T00:00:00.000Z'),
    })

    observability.emit({
      context: { requestId: 'req_test' },
      event: 'provider.completed',
      level: 'info',
      fields: {
        status: 'ok',
        providerCode: 'provider_test',
        token: 'blocked-value',
        nested: {
          prompt: 'blocked-value',
          safeCount: 2,
          signedUrl: 'https://example.test/download?signature=blocked-value',
          path: '/Users/example/private.pdf',
        },
        safeValues: ['ok', '/private/not-allowed'],
      },
    })

    const event = sink.events[0]
    expect(event).toBeDefined()
    expect(event?.fields).toEqual({
      status: 'ok',
      providerCode: 'provider_test',
      nested: {
        safeCount: 2,
        signedUrl: '[REDACTED]',
        path: '[REDACTED]',
      },
      safeValues: ['ok', '[REDACTED]'],
    })
  })

  it('blocks sensitive aliases without blocking operational counters', () => {
    const sink = new DeterministicEventSink()
    const observability = createObservability({
      sink,
      service: 'worker',
      environment: 'test',
      now: () => new Date('2026-01-01T00:00:00.000Z'),
    })

    observability.emit({
      context: { requestId: 'req_test' },
      event: 'provider.failed',
      level: 'warn',
      fields: {
        credentials: 'blocked-value',
        accessToken: 'blocked-value',
        cookies: 'blocked-value',
        providerError: { message: 'blocked-value' },
        pdfBody: 'blocked-value',
        selectedText: 'blocked-value',
        userPrompt: 'blocked-value',
        modelOutput: 'blocked-value',
        inputTokens: 4,
        outputTokens: 2,
        durationMs: 8,
      },
    })

    const serialized = JSON.stringify(sink.events[0])
    expect(serialized).not.toContain('blocked-value')
    expect(sink.events[0]?.fields).toEqual({
      inputTokens: 4,
      outputTokens: 2,
      durationMs: 8,
    })
  })
})
