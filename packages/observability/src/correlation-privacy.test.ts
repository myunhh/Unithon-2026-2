import { describe, expect, it } from 'vitest'

import {
  createCorrelationContext,
  createObservability,
  createRequestContext,
  DeterministicEventSink,
  sanitizeCorrelationIds,
  type CorrelationContext,
  type CorrelationIds,
  type StructuredEvent,
} from './index.js'

const CORRELATION_FIELDS = ['requestId', 'traceId', 'runId', 'jobId'] as const
const ADVERSARIAL_INPUTS = [
  'accessTokenValue',
  'AccessTokenValue',
  'xAccessToken',
  'accessToken42',
  'clientSecretValue',
  'sessionCookieValue',
  'x.sessionCookie.y',
  'userPromptText',
  'promptSensitiveText42',
  'x.promptSensitiveText.y',
  'myModelOutput',
  'modelOutputText',
  'x-modelOutput-y',
  'rawProviderErrorText',
  'upstreamProviderError',
  'x.rawProviderError.y',
  'privatePdfPath42',
  'userPdfBody',
  'x.privatePdfPath.y',
  'absolutePathValue',
  'localPdfPath',
  'upstreamTokenValue42',
  'upstreamSecretValue42',
  'upstreamCookieValue42',
  'upstreamtokenvalue42',
  'upstream_secret_value42',
  'upstream.cookie.value.42',
  'upstreamTokenPayload42',
  'preSECRETpost99',
  'xxUserPromptPayload77yy',
  'midModelOutputPayload42tail',
  'edgeRawProviderErrorPayload42z',
  'leftPrivatePdfPathPayload42right',
  'abcBearerCredentialPayload42xyz',
  'signedUrlPayload42tail',
  'apiKeyValue42',
  'xtokenvalue',
  'mysecretvalue',
  'sessioncookievalue42',
  'userprompttext42',
  'rawprovidererrortext42',
  'privatepdfpathvalue42',
  'PROMPTSENSITIVETEXT',
  'MODELOUTPUTSENSITIVETEXT',
  'RAWPROVIDERERROR',
  'ACCESSTOKEN',
  'SESSIONCOOKIE',
  'PRIVATEPDFPATH',
  'promptsensitivetext',
  'modeloutputsensitivetext',
  'rawprovidererror',
  'accesstoken',
  'sessioncookie',
  'privatepdfpath',
] as const
const SAFE_CONTROLS = [
  'opaque_control_42',
  'req_01HZX7K9QW3',
  'modeler_42',
  'promptly_42',
  'tokenizer_42',
  'cookiejar_42',
  'errorless_42',
  'pdfium_42',
  'pathfinder_42',
  'secretary_42',
  'rawhide_42',
  'contention_42',
  'outputting_42',
  'accessibilityToken',
  'secretariat42',
  'promptness42',
  'modelOutputting42',
  'providerErrorless42',
  'pdfPathfinder42',
  'trace_01HZX7K9QW3',
  'run_01HZX7K9QW3',
  'job_01HZX7K9QW3',
  'span_01HZX7K9QW3',
  'worker_01HZX7K9QW3',
] as const
function createExternalContext(ids: CorrelationIds): CorrelationContext {
  const fallback = createCorrelationContext({ requestId: 'req_opaque_control' })
  return {
    ids,
    child: fallback.child,
    withRequest: fallback.withRequest,
    withTrace: fallback.withTrace,
    withRun: fallback.withRun,
    withJob: fallback.withJob,
  }
}

function createIds(value: string): CorrelationIds {
  return { requestId: value, traceId: value, runId: value, jobId: value }
}

function createTestObservability(sink: DeterministicEventSink) {
  return createObservability({
    sink,
    service: 'api',
    environment: 'test',
    now: () => new Date('2026-01-01T00:00:00.000Z'),
  })
}

function expectNoCorrelationMarker(events: readonly StructuredEvent[], marker: string): void {
  for (const event of events) {
    expect(JSON.stringify(event)).not.toContain(marker)
    for (const field of CORRELATION_FIELDS) expect(event).not.toHaveProperty(field)
  }
}

function emitAllPaths(
  observability: ReturnType<typeof createTestObservability>,
  input: CorrelationContext | CorrelationIds,
): StructuredEvent[] {
  return [
    observability.emit({ context: input, event: 'privacy.emit', level: 'info' }),
    observability.record({ context: input, event: 'privacy.record', level: 'info' }),
    observability.metric({ context: input, name: 'privacy.marker', value: 1 }),
  ]
}

describe('observability correlation privacy boundary', () => {
  it('omits composed sensitive families from returned events and the observed sink', () => {
    for (const marker of ADVERSARIAL_INPUTS) {
      const sink = new DeterministicEventSink()
      const observability = createTestObservability(sink)
      const ids = createIds(marker)
      const context = createCorrelationContext(ids)
      const requestContext = createRequestContext(marker)
      const helperContexts = [
        context.withRequest(marker),
        context.withTrace(marker),
        context.withRun(marker),
        context.withJob(marker),
      ]
      const factoryContext = createCorrelationContext({}, { createId: () => marker })
      const factoryChildren = [
        factoryContext.withRequest(),
        factoryContext.withTrace(),
        factoryContext.withRun(),
        factoryContext.withJob(),
        createRequestContext(undefined, { createId: () => marker }),
      ]
      const inputs: readonly (CorrelationContext | CorrelationIds)[] = [
        ids,
        createExternalContext(ids),
      ]

      expect(sanitizeCorrelationIds(ids)).toEqual({})
      expect(context.ids).toEqual({})
      expect(requestContext.ids).toEqual({})
      for (const helperContext of helperContexts) expect(helperContext.ids).toEqual({})
      for (const factoryChild of factoryChildren) expect(factoryChild.ids).toEqual({})

      const returnedEvents: StructuredEvent[] = []
      for (const input of inputs) {
        const scoped = observability.scope(input)
        expect(scoped.ids).toEqual({})
        returnedEvents.push(...emitAllPaths(observability, input))
      }

      for (const helperContext of [...helperContexts, ...factoryChildren]) {
        returnedEvents.push(
          observability.emit({ context: helperContext, event: 'privacy.helper', level: 'info' }),
        )
      }

      expectNoCorrelationMarker(returnedEvents, marker)
      expectNoCorrelationMarker(sink.events, marker)
    }
  })

  it('preserves safe opaque and lookalike IDs across public contexts and helpers', () => {
    for (const value of SAFE_CONTROLS) {
      const safeIds = createIds(value)
      const sink = new DeterministicEventSink()
      const observability = createTestObservability(sink)
      const context = createCorrelationContext(safeIds)
      const helperContexts = [
        context.withRequest(value),
        context.withTrace(value),
        context.withRun(value),
        context.withJob(value),
      ]

      expect(sanitizeCorrelationIds(safeIds)).toEqual(safeIds)
      expect(context.ids).toEqual(safeIds)
      for (const helperContext of helperContexts) expect(helperContext.ids).toEqual(safeIds)

      for (const input of [safeIds, createExternalContext(safeIds)]) {
        expect(observability.scope(input).ids).toEqual(safeIds)
        observability.emit({ context: input, event: 'privacy.safe', level: 'info' })
        observability.record({ context: input, event: 'privacy.safe_record', level: 'info' })
        observability.metric({ context: input, name: 'privacy.safe_metric', value: 1 })
      }

      for (const helperContext of helperContexts) {
        observability.emit({ context: helperContext, event: 'privacy.safe_helper', level: 'info' })
      }

      for (const event of sink.events) expect(event).toMatchObject(safeIds)
    }
  })
})
