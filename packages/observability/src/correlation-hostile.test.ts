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
const MALFORMED_INPUTS: readonly unknown[] = [
  null,
  42,
  false,
  Symbol('malformed'),
  { ids: null },
  { ids: 42 },
  { ids: false },
  { ids: Symbol('malformed-context') },
  { requestId: null },
  { traceId: 42 },
]
const HOSTILE_INPUTS: readonly unknown[] = [
  Object.defineProperty({}, 'requestId', {
    get: () => { throw new Error('hostile correlation getter') },
  }),
  Object.defineProperty({}, 'ids', {
    get: () => { throw new Error('hostile ids getter') },
  }),
  new Proxy({}, {
    get: () => { throw new Error('hostile proxy get') },
  }),
  new Proxy({ ids: {} }, {
    has: () => { throw new Error('hostile proxy has') },
  }),
  new Proxy({}, {
    ownKeys: () => { throw new Error('hostile proxy keys') },
  }),
  new Proxy([], {
    get: () => { throw new Error('hostile array get') },
    ownKeys: () => { throw new Error('hostile array keys') },
  }),
]
const HOSTILE_EVENT_INPUTS: readonly unknown[] = [
  Object.defineProperty(
    Object.defineProperty({}, 'event', {
      get: () => { throw new Error('hostile event getter') },
    }),
    'value',
    { get: () => { throw new Error('hostile metric getter') }, },
  ),
  Object.defineProperty({}, 'value', {
    get: () => { throw new Error('hostile metric getter') },
  }),
  new Proxy({}, {
    get: () => { throw new Error('hostile event proxy') },
    has: () => { throw new Error('hostile event has') },
  }),
  new Proxy([], {
    get: () => { throw new Error('hostile event array') },
    ownKeys: () => { throw new Error('hostile event keys') },
  }),
]

function createTestObservability(sink: DeterministicEventSink) {
  return createObservability({
    sink,
    service: 'api',
    environment: 'test',
    now: () => new Date('2026-01-01T00:00:00.000Z'),
  })
}

function expectNoMalformedCorrelation(events: readonly StructuredEvent[]): void {
  for (const event of events) {
    for (const field of CORRELATION_FIELDS) expect(event).not.toHaveProperty(field)
  }
}

describe('observability correlation hostile input boundary', () => {
  it('omits malformed correlation inputs without throwing or leaking values', () => {
    for (const input of MALFORMED_INPUTS) {
      let result: CorrelationIds | undefined
      expect(() => {
        result = Reflect.apply(sanitizeCorrelationIds, undefined, [input])
      }).not.toThrow()
      expect(result ?? {}).toEqual({})

      let context: CorrelationContext | undefined
      expect(() => {
        context = Reflect.apply(createCorrelationContext, undefined, [input])
      }).not.toThrow()
      expect(context?.ids).toEqual({})

      let requestContext: CorrelationContext | undefined
      expect(() => {
        requestContext = Reflect.apply(createRequestContext, undefined, [input])
      }).not.toThrow()
      expect(requestContext?.ids).toEqual({})

      const sink = new DeterministicEventSink()
      const observability = createTestObservability(sink)
      let scoped: CorrelationContext | undefined
      expect(() => {
        scoped = Reflect.apply(observability.scope, observability, [input])
      }).not.toThrow()
      expect(scoped?.ids).toEqual({})

      const returnedEvents: StructuredEvent[] = []
      expect(() => {
        returnedEvents.push(
          Reflect.apply(observability.emit, observability, [input]),
          Reflect.apply(observability.record, observability, [input]),
        )
      }).not.toThrow()
      expect(() => {
        returnedEvents.push(
          Reflect.apply(observability.emit, observability, [
            { context: input, event: 'privacy.malformed_emit', level: 'info' },
          ]),
          Reflect.apply(observability.record, observability, [
            { context: input, event: 'privacy.malformed_record', level: 'info' },
          ]),
          Reflect.apply(observability.metric, observability, [
            { context: input, name: 'privacy.malformed_metric', value: 1 },
          ]),
        )
      }).not.toThrow()
      expectNoMalformedCorrelation(returnedEvents)
      expectNoMalformedCorrelation(sink.events)
    }
  })

  it('rejects hostile correlation objects without raw exceptions or sink leakage', () => {
    for (const input of HOSTILE_INPUTS) {
      const sink = new DeterministicEventSink()
      const observability = createTestObservability(sink)
      let sanitized: CorrelationIds | undefined
      expect(() => {
        sanitized = Reflect.apply(sanitizeCorrelationIds, undefined, [input])
      }).not.toThrow()
      expect(sanitized ?? {}).toEqual({})

      let context: CorrelationContext | undefined
      expect(() => {
        context = Reflect.apply(createCorrelationContext, undefined, [input])
      }).not.toThrow()
      expect(context?.ids).toEqual({})

      let requestContext: CorrelationContext | undefined
      expect(() => {
        requestContext = Reflect.apply(createRequestContext, undefined, [input])
      }).not.toThrow()
      expect(requestContext?.ids).toEqual({})

      let scoped: CorrelationContext | undefined
      expect(() => {
        scoped = Reflect.apply(observability.scope, observability, [input])
      }).not.toThrow()
      expect(scoped?.ids).toEqual({})

      const returnedEvents: StructuredEvent[] = []
      expect(() => {
        returnedEvents.push(
          Reflect.apply(observability.emit, observability, [
            { context: input, event: 'privacy.boundary_emit', level: 'info' },
          ]),
          Reflect.apply(observability.record, observability, [
            { context: input, event: 'privacy.boundary_record', level: 'info' },
          ]),
          Reflect.apply(observability.metric, observability, [
            { context: input, name: 'privacy.boundary_metric', value: 1 },
          ]),
        )
      }).not.toThrow()
      expectNoMalformedCorrelation(returnedEvents)
      expectNoMalformedCorrelation(sink.events)
      for (const event of [...returnedEvents, ...sink.events]) {
        expect(JSON.stringify(event)).not.toContain('hostile')
      }
    }
  })

  it('keeps hostile public event and metric inputs total', () => {
    for (const input of HOSTILE_EVENT_INPUTS) {
      const sink = new DeterministicEventSink()
      const observability = createTestObservability(sink)
      const returnedEvents: StructuredEvent[] = []
      expect(() => {
        returnedEvents.push(
          Reflect.apply(observability.emit, observability, [input]),
          Reflect.apply(observability.record, observability, [input]),
          Reflect.apply(observability.metric, observability, [input]),
        )
      }).not.toThrow()
      expectNoMalformedCorrelation(returnedEvents)
      expectNoMalformedCorrelation(sink.events)
      for (const event of [...returnedEvents, ...sink.events]) {
        expect(JSON.stringify(event)).not.toContain('hostile')
      }
    }
  })
})
