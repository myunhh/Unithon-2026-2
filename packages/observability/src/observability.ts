import { createCorrelationContext, sanitizeCorrelationIds } from './correlation.js'
import { isSafeRecord, readSafeProperty } from './correlation-runtime.js'
import type { SafePropertyRead } from './correlation-runtime.js'
import { sanitizeFields } from './redaction.js'
import type {
  CorrelationContext,
  CorrelationIds,
  EventInput,
  LogLevel,
  MetricInput,
  Observability,
  ObservabilityOptions,
  SafeFields,
  StructuredEvent,
} from './types.js'
import { LOG_LEVELS } from './types.js'

const LABEL = /^[a-z][a-z0-9_.:-]{0,127}$/

export class InvalidObservabilityLabelError extends Error {
  readonly name = 'InvalidObservabilityLabelError'

  constructor(readonly field: 'service' | 'environment' | 'event', readonly value: string) {
    super(`Invalid observability ${field}`)
  }
}

export class InvalidObservabilityTimestampError extends Error {
  readonly name = 'InvalidObservabilityTimestampError'

  constructor() {
    super('Observability clock returned an invalid timestamp')
  }
}

function validateLabel(field: 'service' | 'environment' | 'event', value: string): string {
  if (!LABEL.test(value)) throw new InvalidObservabilityLabelError(field, value)
  return value
}

const MISSING_INPUT_PROPERTY: SafePropertyRead = {
  ok: true,
  present: false,
  value: undefined,
}

function readInputResult(value: unknown, key: string): SafePropertyRead {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) {
    return MISSING_INPUT_PROPERTY
  }
  if (!isSafeRecord(value)) return { ok: false, present: false, value: undefined }
  return readSafeProperty(value, key)
}

function readInput(value: unknown, key: string): unknown {
  const result = readInputResult(value, key)
  return result.ok && result.present ? result.value : undefined
}

function getIds(value: unknown): CorrelationIds | undefined {
  if (!isSafeRecord(value)) return undefined
  const ids = readSafeProperty(value, 'ids')
  if (!ids.ok) return undefined
  return ids.present ? sanitizeCorrelationIds(ids.value) : sanitizeCorrelationIds(value)
}

function isLogLevel(value: unknown): value is LogLevel {
  return LOG_LEVELS.some((level) => level === value)
}

function isFieldsRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return isSafeRecord(value)
}

function safeSanitizeFields(value: unknown): SafeFields {
  if (!isFieldsRecord(value)) return {}
  try {
    return sanitizeFields(value)
  } catch (error) {
    if (error instanceof Error) return {}
    return {}
  }
}

function timestamp(now: () => Date): string {
  const date = now()
  if (Number.isNaN(date.getTime())) throw new InvalidObservabilityTimestampError()
  return date.toISOString()
}

function withCorrelation(
  event: Omit<StructuredEvent, 'requestId' | 'traceId' | 'runId' | 'jobId'>,
  ids: CorrelationIds | undefined,
): StructuredEvent {
  const requestId = ids?.requestId
  const traceId = ids?.traceId
  const runId = ids?.runId
  const jobId = ids?.jobId

  return {
    ...event,
    ...(requestId === undefined ? {} : { requestId }),
    ...(traceId === undefined ? {} : { traceId }),
    ...(runId === undefined ? {} : { runId }),
    ...(jobId === undefined ? {} : { jobId }),
  }
}

export class ObservabilityCore implements Observability {
  readonly #sink: ObservabilityOptions['sink']
  readonly #service: string
  readonly #environment: string
  readonly #now: () => Date
  readonly #createId: ObservabilityOptions['createId']

  constructor(options: ObservabilityOptions) {
    this.#sink = options.sink
    this.#service = validateLabel('service', options.service)
    this.#environment = validateLabel('environment', options.environment)
    this.#now = options.now ?? (() => new Date())
    this.#createId = options.createId
  }

  #emitValues(
    eventName: string,
    level: LogLevel,
    fields: unknown,
    context: unknown,
  ): StructuredEvent {
    const event = withCorrelation(
      {
        timestamp: timestamp(this.#now),
        level,
        service: this.#service,
        environment: this.#environment,
        event: validateLabel('event', eventName),
        fields: safeSanitizeFields(fields),
      },
      getIds(context),
    )
    this.#sink.write(event)
    return event
  }

  scope(seed?: CorrelationContext | CorrelationIds): CorrelationContext {
    const options = this.#createId === undefined ? {} : { createId: this.#createId }
    if (!isSafeRecord(seed)) {
      return createCorrelationContext(undefined, options)
    }
    const ids = readSafeProperty(seed, 'ids')
    if (!ids.ok) return createCorrelationContext(undefined, options)
    return createCorrelationContext(
      ids.present ? sanitizeCorrelationIds(ids.value) : sanitizeCorrelationIds(seed),
      options,
    )
  }

  emit(input: EventInput): StructuredEvent {
    const eventName = readInput(input, 'event')
    const level = readInput(input, 'level')
    return this.#emitValues(
      typeof eventName === 'string' ? eventName : 'observability.invalid',
      isLogLevel(level) ? level : 'warn',
      readInput(input, 'fields'),
      readInput(input, 'context'),
    )
  }

  record(input: EventInput): StructuredEvent {
    return this.emit(input)
  }

  metric(input: MetricInput): StructuredEvent {
    const valueResult = readInputResult(input, 'value')
    if (
      !valueResult.ok ||
      !valueResult.present ||
      typeof valueResult.value !== 'number' ||
      !Number.isFinite(valueResult.value)
    ) {
      return this.#emitValues('metric.invalid', 'warn', undefined, undefined)
    }
    const value = valueResult.value
    const name = readInput(input, 'name')
    const unit = readInput(input, 'unit')
    const fields: Record<string, unknown> = {
      ...safeSanitizeFields(readInput(input, 'fields')),
      value,
      ...(typeof unit === 'string' ? { unit } : {}),
    }
    return this.#emitValues(
      `metric.${typeof name === 'string' ? name : 'invalid'}`,
      'info',
      fields,
      readInput(input, 'context'),
    )
  }
}

export function createObservability(options: ObservabilityOptions): ObservabilityCore {
  return new ObservabilityCore(options)
}
