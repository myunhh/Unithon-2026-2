import { describe, expect, it } from 'vitest'

import {
  createDeterministicSink,
  createObservability,
  createTestSink,
  DeterministicEventSink,
  type StructuredEvent,
} from './index.js'

const CORRELATION_FIELDS = ['requestId', 'traceId', 'runId', 'jobId'] as const
const MALFORMED_INPUTS: readonly unknown[] = [
  undefined,
  null,
  42,
  false,
  Symbol('malformed'),
  {},
  { value: 'not-a-number' },
  { value: Number.NaN },
]
const HOSTILE_METRIC_INPUTS: readonly unknown[] = [
  Object.defineProperty({}, 'value', {
    get: () => { throw new Error('hostile metric getter') },
  }),
  new Proxy({}, {
    get: () => { throw new Error('hostile metric get') },
    has: () => { throw new Error('hostile metric has') },
  }),
  new Proxy([], {
    get: () => { throw new Error('hostile metric array') },
    ownKeys: () => { throw new Error('hostile metric keys') },
  }),
]
const HOSTILE_SINK_INPUTS: readonly unknown[] = [
  ...MALFORMED_INPUTS,
  ...HOSTILE_METRIC_INPUTS,
  Object.defineProperty({}, 'timestamp', {
    get: () => { throw new Error('hostile sink timestamp') },
  }),
  Object.defineProperty({}, 'fields', {
    get: () => { throw new Error('hostile sink fields') },
  }),
  new Proxy({}, {
    get: () => { throw new Error('hostile sink get') },
  }),
  new Proxy({}, {
    has: () => { throw new Error('hostile sink has') },
  }),
  new Proxy({}, {
    ownKeys: () => { throw new Error('hostile sink keys') },
  }),
  new Proxy([], {
    get: () => { throw new Error('hostile sink array') },
    ownKeys: () => { throw new Error('hostile sink array keys') },
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

function expectNoCorrelation(events: readonly StructuredEvent[]): void {
  for (const event of events) {
    for (const field of CORRELATION_FIELDS) expect(event).not.toHaveProperty(field)
    expect(JSON.stringify(event)).not.toContain('hostile')
  }
}

describe('observability exported public boundaries', () => {
  it('uses the invalid-event path for direct malformed metric inputs', () => {
    for (const input of [...MALFORMED_INPUTS, ...HOSTILE_METRIC_INPUTS]) {
      const sink = new DeterministicEventSink()
      const observability = createTestObservability(sink)
      let returned: StructuredEvent | undefined
      expect(() => {
        returned = Reflect.apply(observability.metric, observability, [input])
      }).not.toThrow()
      expect(returned?.event).toBe('metric.invalid')
      expect(returned?.fields).toEqual({})
      expect(returned).toBeDefined()
      if (returned === undefined) continue
      expectNoCorrelation([returned, ...sink.events])
    }
  })

  it('ignores malformed direct deterministic-sink writes and keeps reads total', () => {
    for (const input of HOSTILE_SINK_INPUTS) {
      for (const sink of [new DeterministicEventSink(), createDeterministicSink(), createTestSink()]) {
        expect(() => {
          Reflect.apply(sink.write, sink, [input])
        }).not.toThrow()
        let events: readonly StructuredEvent[] = []
        expect(() => {
          events = sink.events
          sink.clear()
          events = [...events, ...sink.events]
        }).not.toThrow()
        expect(events).toEqual([])
      }
    }
  })

  it('preserves valid direct sink writes and clear behavior', () => {
    const source = new DeterministicEventSink()
    const observability = createTestObservability(source)
    const event = observability.emit({
      event: 'boundary.valid',
      level: 'info',
      fields: { count: 1 },
    })
    for (const sink of [new DeterministicEventSink(), createDeterministicSink(), createTestSink()]) {
      sink.write(event)
      expect(sink.events).toMatchObject([{ event: 'boundary.valid', fields: { count: 1 } }])
      sink.clear()
      expect(sink.events).toEqual([])
    }
  })
})
