export const packageSurface = {
  name: '@paperbridge/security',
  entrypoint: 'library',
} as const

export { ManualRateLimitClock, SystemRateLimitClock } from './rate-limit-clock.js'
export {
  RateLimiter,
  createRateLimiter,
} from './rate-limiter.js'
export type {
  RateLimitAllowedDecision,
  RateLimitBucketSnapshot,
  RateLimitDecision,
  RateLimitRejectedDecision,
  RateLimiterOptions,
  RateLimiterPort,
} from './rate-limiter.js'
export {
  RateLimitClockError,
  RateLimitPolicyError,
  RateLimitRequestError,
  RateLimitStoreRequestError,
  RateLimitStoreResultError,
} from './rate-limit-types.js'
export type {
  RateLimitClock,
  RateLimitDimension,
  RateLimitPolicy,
  RateLimitRequest,
  RateLimitStore,
  RateLimitStoreBucket,
  RateLimitStoreBucketResult,
  RateLimitStoreRequest,
  RateLimitStoreResult,
  RateLimitWindowPolicy,
} from './rate-limit-types.js'
