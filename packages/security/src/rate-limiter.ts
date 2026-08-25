import {
  RateLimitStoreResultError,
  type RateLimitClock,
  type RateLimitDimension,
  type RateLimitPolicy,
  type RateLimitRequest,
  type RateLimitStore,
  type RateLimitStoreBucket,
  type RateLimitStoreBucketResult,
  validateClockNow,
  validateRateLimitPolicy,
  validateRateLimitRequest,
  rateLimitBucketKey,
} from './rate-limit-types.js'
import { validateRateLimitStoreResult } from './rate-limit-result.js'

export type RateLimitBucketSnapshot = RateLimitStoreBucketResult

export type RateLimitAllowedDecision = Readonly<{
  allowed: true
  limit: number
  remaining: number
  resetAtMs: number
  retryAfterMs: 0
  retryAfterSeconds: 0
  buckets: readonly RateLimitBucketSnapshot[]
}>

export type RateLimitRejectedDecision = Readonly<{
  allowed: false
  limit: number
  remaining: 0
  resetAtMs: number
  retryAfterMs: number
  retryAfterSeconds: number
  rejectedDimension: RateLimitDimension
  rejectedDimensions: readonly RateLimitDimension[]
  buckets: readonly RateLimitBucketSnapshot[]
}>

export type RateLimitDecision = RateLimitAllowedDecision | RateLimitRejectedDecision

export type RateLimiterOptions = Readonly<{
  policy: RateLimitPolicy
  store: RateLimitStore
  clock: RateLimitClock
}>

export interface RateLimiterPort {
  consume(request: RateLimitRequest): Promise<RateLimitDecision>
}

export class RateLimiter implements RateLimiterPort {
  readonly #policy: RateLimitPolicy
  readonly #store: RateLimitStore
  readonly #clock: RateLimitClock

  constructor(options: RateLimiterOptions) {
    this.#policy = validateRateLimitPolicy(options.policy)
    this.#store = options.store
    this.#clock = options.clock
  }

  async consume(request: RateLimitRequest): Promise<RateLimitDecision> {
    const validRequest = validateRateLimitRequest(request)
    const nowMs = validateClockNow(this.#clock.nowMs())
    const buckets = this.#bucketsFor(validRequest)
    let result: unknown
    try {
      result = await this.#store.checkAndConsume({ nowMs, buckets })
    } catch {
      throw new RateLimitStoreResultError('Store result could not be read safely.')
    }
    const validResult = validateRateLimitStoreResult(result, buckets, nowMs)
    return decisionFrom(validResult.committed, validResult.buckets, nowMs)
  }

  #bucketsFor(request: RateLimitRequest): readonly RateLimitStoreBucket[] {
    const buckets: RateLimitStoreBucket[] = [
      createBucket('route', request.route, this.#policy.route),
    ]
    if (request.userId !== undefined) buckets.push(createBucket('user', request.userId, this.#policy.user))
    if (request.workspaceId !== undefined) buckets.push(createBucket('workspace', request.workspaceId, this.#policy.workspace))
    if (request.providerCode !== undefined) buckets.push(createBucket('provider', request.providerCode, this.#policy.provider))
    return buckets
  }
}

export function createRateLimiter(options: RateLimiterOptions): RateLimiterPort {
  return new RateLimiter(options)
}

function createBucket(
  dimension: RateLimitDimension,
  value: string,
  policy: RateLimitPolicy[RateLimitDimension],
): RateLimitStoreBucket {
  return {
    dimension,
    key: rateLimitBucketKey(dimension, value),
    policy,
  }
}

function decisionFrom(
  committed: boolean,
  buckets: readonly RateLimitBucketSnapshot[],
  nowMs: number,
): RateLimitDecision {
  const rejected = buckets.filter((bucket) => !bucket.allowed)
  if (committed) {
    return {
      allowed: true,
      limit: Math.min(...buckets.map((bucket) => bucket.limit)),
      remaining: Math.min(...buckets.map((bucket) => bucket.remaining)),
      resetAtMs: Math.max(...buckets.map((bucket) => bucket.resetAtMs)),
      retryAfterMs: 0,
      retryAfterSeconds: 0,
      buckets,
    }
  }
  const rejectedDimensions = rejected.map((bucket) => bucket.dimension)
  const resetAtMs = Math.max(...rejected.map((bucket) => bucket.resetAtMs))
  const retryAfterMs = Math.max(0, resetAtMs - nowMs)
  const firstRejected = rejected[0]
  if (firstRejected === undefined) {
    throw new RateLimitStoreResultError('Store rejected without identifying a rejected bucket.')
  }
  return {
    allowed: false,
    limit: firstRejected.limit,
    remaining: 0,
    resetAtMs,
    retryAfterMs,
    retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1_000)),
    rejectedDimension: firstRejected.dimension,
    rejectedDimensions,
    buckets,
  }
}
