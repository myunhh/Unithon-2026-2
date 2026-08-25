import { isSafeRecord, readSafeProperty } from './correlation-runtime.js'
import { sanitizeCorrelationIds } from './correlation.js'
import { sanitizeFields } from './redaction.js'
import type { EventSink, LogLevel, SafeFieldValue, SafeFields, StructuredEvent } from './types.js'
import { LOG_LEVELS } from './types.js'

const LABEL = /^[a-z][a-z0-9_.:-]{0,127}$/
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

function copyValue(value: SafeFieldValue): SafeFieldValue {
  if (Array.isArray(value)) return value.map(copyValue)
  if (value !== null && typeof value === 'object') {
    const copy: Record<string, SafeFieldValue> = {}
    for (const [key, nested] of Object.entries(value)) copy[key] = copyValue(nested)
    return copy
  }
  return value
}

function copyFields(fields: SafeFields): SafeFields {
  const copy: Record<string, SafeFieldValue> = {}
  for (const [key, value] of Object.entries(fields)) copy[key] = copyValue(value)
  return copy
}

function isLogLevel(value: unknown): value is LogLevel {
  return LOG_LEVELS.some((level) => level === value)
}

function isLabel(value: unknown): value is string {
  return typeof value === 'string' && LABEL.test(value)
}

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && ISO_TIMESTAMP.test(value)
}

function isFieldRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return isSafeRecord(value)
}

function sanitizeEventFields(value: unknown): SafeFields | undefined {
  if (!isFieldRecord(value)) return undefined
  try {
    return sanitizeFields(value)
  } catch (error) {
    if (error instanceof Error) return undefined
    return undefined
  }
}

function readEventProperty(event: object, key: string): unknown {
  const result = readSafeProperty(event, key)
  return result.ok && result.present ? result.value : undefined
}

function copyEvent(event: unknown): StructuredEvent | undefined {
  if (!isSafeRecord(event)) return undefined
  const timestamp = readEventProperty(event, 'timestamp')
  const level = readEventProperty(event, 'level')
  const service = readEventProperty(event, 'service')
  const environment = readEventProperty(event, 'environment')
  const eventName = readEventProperty(event, 'event')
  const fields = sanitizeEventFields(readEventProperty(event, 'fields'))
  if (
    !isTimestamp(timestamp) ||
    !isLogLevel(level) ||
    !isLabel(service) ||
    !isLabel(environment) ||
    !isLabel(eventName) ||
    fields === undefined
  ) return undefined

  const ids = sanitizeCorrelationIds(event) ?? {}
  return {
    timestamp,
    level,
    service,
    environment,
    event: eventName,
    ...(ids.requestId === undefined ? {} : { requestId: ids.requestId }),
    ...(ids.traceId === undefined ? {} : { traceId: ids.traceId }),
    ...(ids.runId === undefined ? {} : { runId: ids.runId }),
    ...(ids.jobId === undefined ? {} : { jobId: ids.jobId }),
    fields: copyFields(fields),
  }
}

export class DeterministicEventSink implements EventSink {
  readonly #events: StructuredEvent[] = []

  write(event: unknown): void {
    const copy = copyEvent(event)
    if (copy !== undefined) this.#events.push(copy)
  }

  get events(): readonly StructuredEvent[] {
    return this.#events.flatMap((event) => {
      const copy = copyEvent(event)
      return copy === undefined ? [] : [copy]
    })
  }

  clear(): void {
    this.#events.length = 0
  }
}

export function createDeterministicSink(): DeterministicEventSink {
  return new DeterministicEventSink()
}

export const createTestSink = createDeterministicSink
