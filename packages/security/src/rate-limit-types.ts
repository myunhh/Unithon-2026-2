export const RATE_LIMIT_DIMENSIONS = ['route', 'user', 'workspace', 'provider'] as const

export type RateLimitDimension = (typeof RATE_LIMIT_DIMENSIONS)[number]

export type RateLimitWindowPolicy = Readonly<{
  limit: number
  windowMs: number
}>

export type RateLimitPolicy = Readonly<Record<RateLimitDimension, RateLimitWindowPolicy>>

export type RateLimitRequest = Readonly<{
  route: string
  userId?: string
  workspaceId?: string
  providerCode?: string
}>

export type RateLimitStoreBucket = Readonly<{
  dimension: RateLimitDimension
  key: string
  policy: RateLimitWindowPolicy
}>

export type RateLimitStoreRequest = Readonly<{
  nowMs: number
  buckets: readonly RateLimitStoreBucket[]
}>

export type RateLimitStoreBucketResult = Readonly<{
  dimension: RateLimitDimension
  allowed: boolean
  limit: number
  remaining: number
  resetAtMs: number
}>

export type RateLimitStoreResult = Readonly<{
  committed: boolean
  buckets: readonly RateLimitStoreBucketResult[]
}>

export interface RateLimitStore {
  checkAndConsume(request: RateLimitStoreRequest): Promise<RateLimitStoreResult>
}

export interface RateLimitClock {
  nowMs(): number
}

export class RateLimitPolicyError extends Error {
  readonly name = 'RateLimitPolicyError'

  constructor(readonly field: string, message: string) {
    super(message)
  }
}

export class RateLimitRequestError extends Error {
  readonly name = 'RateLimitRequestError'

  constructor(readonly field: string, message: string) {
    super(message)
  }
}

export class RateLimitStoreRequestError extends Error {
  readonly name = 'RateLimitStoreRequestError'

  constructor(readonly field: string, message: string) {
    super(message)
  }
}

export class RateLimitStoreResultError extends Error {
  readonly name = 'RateLimitStoreResultError'
}

export class RateLimitClockError extends Error {
  readonly name = 'RateLimitClockError'
}

const MAX_DIMENSION_VALUE_LENGTH = 512
const MAX_BUCKET_KEY_LENGTH = 2_048

export function validateRateLimitPolicy(policy: unknown): RateLimitPolicy {
  if (!isRecord(policy)) {
    throw new RateLimitPolicyError('policy', 'Rate-limit policies must be objects.')
  }

  const validatedPolicy: Record<RateLimitDimension, RateLimitWindowPolicy> = {
    route: parseWindowPolicy('route', policy['route']),
    user: parseWindowPolicy('user', policy['user']),
    workspace: parseWindowPolicy('workspace', policy['workspace']),
    provider: parseWindowPolicy('provider', policy['provider']),
  }
  return validatedPolicy
}

function parseWindowPolicy(dimension: RateLimitDimension, value: unknown): RateLimitWindowPolicy {
  if (!isRecord(value)) {
    throw new RateLimitPolicyError(dimension, 'Rate-limit dimension policies must be objects.')
  }
  return {
    limit: parsePositiveSafeInteger(`${dimension}.limit`, value['limit']),
    windowMs: parsePositiveSafeInteger(`${dimension}.windowMs`, value['windowMs']),
  }
}

function parsePositiveSafeInteger(field: string, value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    throw new RateLimitPolicyError(field, 'Rate-limit values must be positive safe integers.')
  }
  return value
}

export function validateRateLimitRequest(request: unknown): RateLimitRequest {
  if (!isRecord(request)) {
    throw new RateLimitRequestError('request', 'Rate-limit requests must be objects.')
  }

  const route = validateDimensionValue('route', request['route'])
  const userId = validateOptionalDimension('userId', request['userId'])
  const workspaceId = validateOptionalDimension('workspaceId', request['workspaceId'])
  const providerCode = validateOptionalDimension('providerCode', request['providerCode'])
  const validatedRequest: {
    route: string
    userId?: string
    workspaceId?: string
    providerCode?: string
  } = { route }

  if (userId !== undefined) validatedRequest.userId = userId
  if (workspaceId !== undefined) validatedRequest.workspaceId = workspaceId
  if (providerCode !== undefined) validatedRequest.providerCode = providerCode
  return validatedRequest
}

export function validateStoreRequest(request: unknown): RateLimitStoreRequest {
  if (!isRecord(request)) {
    throw new RateLimitStoreRequestError('request', 'Store requests must be objects.')
  }

  const nowMs = request['nowMs']
  if (typeof nowMs !== 'number' || !Number.isSafeInteger(nowMs) || nowMs < 0) {
    throw new RateLimitStoreRequestError('nowMs', 'Store time must be a non-negative safe integer.')
  }
  const bucketValues = request['buckets']
  if (!Array.isArray(bucketValues)) {
    throw new RateLimitStoreRequestError('buckets', 'Store buckets must be an array.')
  }
  if (bucketValues.length < 1 || bucketValues.length > RATE_LIMIT_DIMENSIONS.length) {
    throw new RateLimitStoreRequestError('buckets', 'Store requests must contain one to four buckets.')
  }

  const buckets = bucketValues.map((bucket, index) => parseStoreBucket(bucket, index))
  const dimensions = new Set<RateLimitDimension>()
  for (const bucket of buckets) {
    if (dimensions.has(bucket.dimension)) {
      throw new RateLimitStoreRequestError('buckets', 'Store requests cannot repeat a dimension.')
    }
    dimensions.add(bucket.dimension)
  }
  return { nowMs, buckets }
}

function parseStoreBucket(value: unknown, index: number): RateLimitStoreBucket {
  const field = `buckets[${index}]`
  if (!isRecord(value)) {
    throw new RateLimitStoreRequestError(field, 'Store buckets must be objects.')
  }
  const dimension = validateStoreDimension(`${field}.dimension`, value['dimension'])
  const key = validateStoreKey(value['key'], `${field}.key`)
  const policyValue = value['policy']
  if (!isRecord(policyValue)) {
    throw new RateLimitStoreRequestError(`${field}.policy`, 'Store bucket policies must be objects.')
  }
  const policy = parseWindowPolicy(dimension, policyValue)
  return { dimension, key, policy }
}

export function rateLimitBucketKey(dimension: unknown, value: unknown): string {
  const validDimension = validateStoreDimension('dimension', dimension)
  const validValue = validateStoreDimensionValue('value', value)
  return JSON.stringify([validDimension, validValue])
}

export function validateClockNow(nowMs: number): number {
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) {
    throw new RateLimitClockError('Rate-limit clock must return a non-negative safe integer.')
  }
  return nowMs
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validateOptionalDimension(field: string, value: unknown): string | undefined {
  if (value === undefined) return undefined
  return validateDimensionValue(field, value)
}

function validateDimensionValue(field: string, value: unknown): string {
  if (typeof value !== 'string') {
    throw new RateLimitRequestError(field, 'Rate-limit dimension values must be strings.')
  }
  if (value.length < 1 || value.length > MAX_DIMENSION_VALUE_LENGTH) {
    throw new RateLimitRequestError(field, 'Rate-limit dimension values must be 1 to 512 characters.')
  }
  return value
}

function validateStoreDimension(field: string, value: unknown): RateLimitDimension {
  for (const dimension of RATE_LIMIT_DIMENSIONS) {
    if (value === dimension) return dimension
  }
  throw new RateLimitStoreRequestError(field, 'Rate-limit dimensions must be route, user, workspace, or provider.')
}

function validateStoreDimensionValue(field: string, value: unknown): string {
  if (typeof value !== 'string') {
    throw new RateLimitStoreRequestError(field, 'Rate-limit store key values must be strings.')
  }
  if (value.length < 1 || value.length > MAX_DIMENSION_VALUE_LENGTH) {
    throw new RateLimitStoreRequestError(field, 'Rate-limit store key values must be 1 to 512 characters.')
  }
  return value
}

function validateStoreKey(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new RateLimitStoreRequestError(field, 'Rate-limit store keys must be strings.')
  }
  if (value.length < 1 || value.length > MAX_BUCKET_KEY_LENGTH) {
    throw new RateLimitStoreRequestError(field, 'Rate-limit store keys must be 1 to 2048 characters.')
  }
  return value
}
