import {
  RateLimitStoreRequestError,
  type RateLimitStore,
  type RateLimitStoreBucket,
  type RateLimitStoreBucketResult,
  type RateLimitStoreRequest,
  type RateLimitStoreResult,
  type RateLimitWindowPolicy,
  validateStoreRequest,
} from '../../src/rate-limit-types.js'

type WindowState = Readonly<{
  limit: number
  windowMs: number
  count: number
  resetAtMs: number
}>

type Candidate = Readonly<{
  bucket: RateLimitStoreBucket
  current: WindowState
  next: WindowState
}>

export class InMemoryRateLimitStore implements RateLimitStore {
  readonly #windows = new Map<string, WindowState>()

  async checkAndConsume(request: RateLimitStoreRequest): Promise<RateLimitStoreResult> {
    const validRequest = validateStoreRequest(request)
    this.#pruneExpired(validRequest.nowMs)

    const candidates = validRequest.buckets.map((bucket) => this.#candidate(bucket, validRequest.nowMs))
    const rejected = candidates.filter((candidate) => candidate.current.count >= candidate.bucket.policy.limit)
    const committed = rejected.length === 0
    if (committed) {
      for (const candidate of candidates) this.#windows.set(candidate.bucket.key, candidate.next)
    }

    return {
      committed,
      buckets: candidates.map((candidate) => this.#result(candidate, committed)),
    }
  }

  clear(): void {
    this.#windows.clear()
  }

  get size(): number {
    return this.#windows.size
  }

  #candidate(bucket: RateLimitStoreBucket, nowMs: number): Candidate {
    const current = this.#currentState(bucket, nowMs)
    return {
      bucket,
      current,
      next: {
        ...current,
        count: current.count + 1,
      },
    }
  }

  #currentState(bucket: RateLimitStoreBucket, nowMs: number): WindowState {
    const existing = this.#windows.get(bucket.key)
    const policy = bucket.policy
    if (
      existing !== undefined
      && existing.resetAtMs > nowMs
      && existing.limit === policy.limit
      && existing.windowMs === policy.windowMs
    ) {
      return existing
    }
    return freshWindowState(policy, nowMs)
  }

  #result(candidate: Candidate, committed: boolean): RateLimitStoreBucketResult {
    const { bucket, current } = candidate
    const allowed = current.count < bucket.policy.limit
    const remaining = committed
      ? bucket.policy.limit - current.count - 1
      : Math.max(0, bucket.policy.limit - current.count)
    return {
      dimension: bucket.dimension,
      allowed,
      limit: bucket.policy.limit,
      remaining,
      resetAtMs: current.resetAtMs,
    }
  }

  #pruneExpired(nowMs: number): void {
    for (const [key, state] of this.#windows) {
      if (state.resetAtMs <= nowMs) this.#windows.delete(key)
    }
  }
}

function freshWindowState(policy: RateLimitWindowPolicy, nowMs: number): WindowState {
  const resetAtMs = nowMs + policy.windowMs
  if (!Number.isSafeInteger(resetAtMs)) {
    throw new RateLimitStoreRequestError('nowMs', 'Rate-limit window exceeds the safe integer range.')
  }
  return {
    limit: policy.limit,
    windowMs: policy.windowMs,
    count: 0,
    resetAtMs,
  }
}
