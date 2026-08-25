import {
  RATE_LIMIT_DIMENSIONS,
  RateLimitStoreResultError,
  type RateLimitDimension,
  type RateLimitStoreBucket,
  type RateLimitStoreBucketResult,
  type RateLimitStoreResult,
} from './rate-limit-types.js'

export function validateRateLimitStoreResult(
  result: unknown,
  requestedBuckets: readonly RateLimitStoreBucket[],
  nowMs: number,
): RateLimitStoreResult {
  if (!isRecord(result, 'result')) {
    throw new RateLimitStoreResultError('Store results must be objects.')
  }
  const committed = readProperty(result, 'committed', 'committed')
  if (typeof committed !== 'boolean') {
    throw new RateLimitStoreResultError('Store result committed flag must be boolean.')
  }
  const rawBuckets = readProperty(result, 'buckets', 'buckets')
  if (!isArray(rawBuckets, 'buckets')) {
    throw new RateLimitStoreResultError('Store result buckets must be an array.')
  }
  const rawBucketLength = readArrayLength(rawBuckets, 'buckets.length')
  if (
    typeof rawBucketLength !== 'number'
    || !Number.isSafeInteger(rawBucketLength)
    || rawBucketLength < 1
    || rawBucketLength > RATE_LIMIT_DIMENSIONS.length
    || requestedBuckets.length < 1
    || rawBucketLength !== requestedBuckets.length
  ) {
    throw new RateLimitStoreResultError('Store result did not return one result per requested bucket.')
  }

  const requestedDimensions = new Map<RateLimitDimension, RateLimitStoreBucket>()
  for (const bucket of requestedBuckets) {
    if (requestedDimensions.has(bucket.dimension)) {
      throw new RateLimitStoreResultError('Store request dimensions were not unique.')
    }
    requestedDimensions.set(bucket.dimension, bucket)
  }

  const resultDimensions = new Set<RateLimitDimension>()
  const buckets: RateLimitStoreBucketResult[] = []
  for (let index = 0; index < rawBucketLength; index += 1) {
    const rawBucket = readArrayItem(rawBuckets, index)
    buckets.push(parseStoreResultBucket(
      rawBucket,
      index,
      requestedDimensions,
      resultDimensions,
      committed,
      nowMs,
    ))
  }
  if (resultDimensions.size !== requestedDimensions.size) {
    throw new RateLimitStoreResultError('Store result dimensions did not match the request.')
  }
  const rejected = buckets.filter((bucket) => !bucket.allowed)
  if (committed && rejected.length > 0) {
    throw new RateLimitStoreResultError('Committed store results cannot contain rejected buckets.')
  }
  if (!committed && rejected.length === 0) {
    throw new RateLimitStoreResultError('Rejected store results must identify a rejected bucket.')
  }
  return { committed, buckets }
}

function parseStoreResultBucket(
  value: unknown,
  index: number,
  requestedDimensions: ReadonlyMap<RateLimitDimension, RateLimitStoreBucket>,
  resultDimensions: Set<RateLimitDimension>,
  committed: boolean,
  nowMs: number,
): RateLimitStoreBucketResult {
  const field = `buckets[${index}]`
  if (!isRecord(value, field)) {
    throw new RateLimitStoreResultError('Store result buckets must contain objects.')
  }
  const dimension = validateStoreResultDimension(readProperty(value, 'dimension', `${field}.dimension`))
  if (resultDimensions.has(dimension)) {
    throw new RateLimitStoreResultError('Store result dimensions must be unique.')
  }
  const requestedBucket = requestedDimensions.get(dimension)
  if (requestedBucket === undefined) {
    throw new RateLimitStoreResultError('Store result dimensions did not match the request.')
  }

  const allowed = validateStoreResultBoolean(readProperty(value, 'allowed', `${field}.allowed`), `${field}.allowed`)
  const limit = validateStoreResultLimit(readProperty(value, 'limit', `${field}.limit`), requestedBucket.policy.limit, `${field}.limit`)
  const remaining = validateStoreResultRemaining(readProperty(value, 'remaining', `${field}.remaining`), limit, `${field}.remaining`)
  const resetAtMs = validateStoreResultResetAt(
    readProperty(value, 'resetAtMs', `${field}.resetAtMs`),
    nowMs,
    requestedBucket.policy.windowMs,
    `${field}.resetAtMs`,
  )
  if (committed && !allowed) {
    throw new RateLimitStoreResultError('Committed store results cannot contain rejected buckets.')
  }
  if (committed && remaining >= limit) {
    throw new RateLimitStoreResultError('Committed store results must consume each bucket.')
  }
  if (!committed && !allowed && remaining !== 0) {
    throw new RateLimitStoreResultError('Rejected store buckets must report zero remaining capacity.')
  }
  resultDimensions.add(dimension)
  return { dimension, allowed, limit, remaining, resetAtMs }
}

function validateStoreResultDimension(value: unknown): RateLimitDimension {
  for (const dimension of RATE_LIMIT_DIMENSIONS) {
    if (value === dimension) return dimension
  }
  throw new RateLimitStoreResultError('Store result contained an invalid dimension.')
}

function validateStoreResultBoolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') {
    throw new RateLimitStoreResultError(`Store result ${field} must be boolean.`)
  }
  return value
}

function validateStoreResultLimit(value: unknown, expected: number, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value !== expected) {
    throw new RateLimitStoreResultError(`Store result ${field} was outside the requested limit.`)
  }
  return value
}

function validateStoreResultRemaining(value: unknown, limit: number, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > limit) {
    throw new RateLimitStoreResultError(`Store result ${field} was outside the requested limit.`)
  }
  return value
}

function validateStoreResultResetAt(value: unknown, nowMs: number, windowMs: number, field: string): number {
  const maxResetAtMs = nowMs + windowMs
  if (
    !Number.isSafeInteger(maxResetAtMs)
    || typeof value !== 'number'
    || !Number.isSafeInteger(value)
    || value <= nowMs
    || value > maxResetAtMs
  ) {
    throw new RateLimitStoreResultError(`Store result ${field} was outside the safe time range.`)
  }
  return value
}

function isRecord(value: unknown, field: string): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false
  try {
    return !Array.isArray(value)
  } catch {
    throw new RateLimitStoreResultError(`Store result ${field} could not be read safely.`)
  }
}

function isArray(value: unknown, field: string): value is readonly unknown[] {
  try {
    return Array.isArray(value)
  } catch {
    throw new RateLimitStoreResultError(`Store result ${field} could not be read safely.`)
  }
}

function readProperty(value: Record<string, unknown>, property: string, field: string): unknown {
  try {
    return value[property]
  } catch {
    throw new RateLimitStoreResultError(`Store result ${field} could not be read safely.`)
  }
}

function readArrayLength(value: readonly unknown[], field: string): unknown {
  try {
    return value.length
  } catch {
    throw new RateLimitStoreResultError(`Store result ${field} could not be read safely.`)
  }
}

function readArrayItem(value: readonly unknown[], index: number): unknown {
  try {
    return value[index]
  } catch {
    throw new RateLimitStoreResultError(`Store result buckets[${index}] could not be read safely.`)
  }
}
