import type {
  CorrelationContext,
  CorrelationContextOptions,
  CorrelationIdFactory,
  CorrelationIds,
  CorrelationKind,
  CorrelationSeed,
} from './types.js'
import { isSensitiveCorrelationValue } from './correlation-marker.js'
import { isSafeRecord, readSafeProperty } from './correlation-runtime.js'

const CORRELATION_ID = /^[A-Za-z][A-Za-z0-9._:-]{0,99}$/
const FORBIDDEN_CORRELATION_VALUE = /(?:bearer|basic)\s+[^\s]+|(?:^|[?;&\s])(?:token|secret|password|api[_-]?key|signature|sig|cookie)=[^\s;&]+|(?:^|[;\s])(?:cookie|set-cookie):\s*[^\s;]+|(?:sk|ghp|xox)[_-][A-Za-z0-9_-]{8,}|eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/i
let generatedIdSequence = 0

export class InvalidCorrelationIdError extends Error {
  readonly name = 'InvalidCorrelationIdError'

  constructor(readonly kind: CorrelationKind, readonly value: string) {
    super(`Invalid ${kind} correlation id`)
  }
}

function assertNever(value: never): never {
  throw new Error(`Unexpected correlation kind: ${String(value)}`)
}

function defaultCreateId(kind: CorrelationKind): string {
  generatedIdSequence += 1
  const suffix = `${Date.now().toString(36)}_${generatedIdSequence.toString(36)}`
  switch (kind) {
    case 'request':
      return `req_${suffix}`
    case 'trace':
      return `trace_${suffix}`
    case 'run':
      return `run_${suffix}`
    case 'job':
      return `job_${suffix}`
    default:
      return assertNever(kind)
  }
}

function sanitizeId(value: unknown): string | undefined {
  if (
    typeof value !== 'string' ||
    !CORRELATION_ID.test(value) ||
    FORBIDDEN_CORRELATION_VALUE.test(value)
  ) return undefined
  if (isSensitiveCorrelationValue(value)) return undefined
  return value
}

function copyId(value: unknown): string | undefined {
  return value === undefined ? undefined : sanitizeId(value)
}

function copySeed(seed: object): CorrelationIds {
  const requestId = copyId(readSeedValue(seed, 'requestId'))
  const traceId = copyId(readSeedValue(seed, 'traceId'))
  const runId = copyId(readSeedValue(seed, 'runId'))
  const jobId = copyId(readSeedValue(seed, 'jobId'))

  return {
    ...(requestId === undefined ? {} : { requestId }),
    ...(traceId === undefined ? {} : { traceId }),
    ...(runId === undefined ? {} : { runId }),
    ...(jobId === undefined ? {} : { jobId }),
  }
}

function readSeedValue(seed: object, key: string): unknown {
  const result = readSafeProperty(seed, key)
  return result.ok && result.present ? result.value : undefined
}

function withId(ids: CorrelationIds, kind: CorrelationKind, id: string): CorrelationIds {
  switch (kind) {
    case 'request':
      return { ...ids, requestId: id }
    case 'trace':
      return { ...ids, traceId: id }
    case 'run':
      return { ...ids, runId: id }
    case 'job':
      return { ...ids, jobId: id }
    default:
      return assertNever(kind)
  }
}

export function sanitizeCorrelationIds(ids: unknown): CorrelationIds | undefined {
  if (!isSafeRecord(ids)) return undefined
  return copySeed(ids)
}

export function createCorrelationContext(
  seed: CorrelationSeed = {},
  options: CorrelationContextOptions = {},
): CorrelationContext {
  const ids = sanitizeCorrelationIds(seed) ?? {}
  const createId: CorrelationIdFactory = options.createId ?? defaultCreateId

  const child = (kind: CorrelationKind, id?: string): CorrelationContext => {
    const nextId = sanitizeId(id ?? createId(kind))
    return nextId === undefined
      ? createCorrelationContext(ids, options)
      : createCorrelationContext(withId(ids, kind, nextId), options)
  }

  return {
    ids,
    child,
    withRequest: (id) => child('request', id),
    withTrace: (id) => child('trace', id),
    withRun: (id) => child('run', id),
    withJob: (id) => child('job', id),
  }
}

export function createRequestContext(
  requestId?: string,
  options: CorrelationContextOptions = {},
): CorrelationContext {
  const context = createCorrelationContext(
    requestId === undefined ? {} : { requestId },
    options,
  )
  return requestId === undefined ? context.withRequest() : context
}
