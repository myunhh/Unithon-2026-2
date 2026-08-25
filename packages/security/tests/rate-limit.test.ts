import { describe, expect, it } from 'vitest'

import {
  ManualRateLimitClock,
  RateLimitPolicyError,
  RateLimitRequestError,
  RateLimitStoreRequestError,
  RateLimitStoreResultError,
  createRateLimiter,
  type RateLimitPolicy,
  type RateLimitStore,
} from '../src/index.js'
import {
  rateLimitBucketKey,
  validateRateLimitPolicy,
  validateRateLimitRequest,
  validateStoreRequest,
} from '../src/rate-limit-types.js'
import { InMemoryRateLimitStore } from './support/in-memory-rate-limit-store.js'

const policy: RateLimitPolicy = {
  route: { limit: 100, windowMs: 1_000 },
  user: { limit: 1, windowMs: 1_000 },
  workspace: { limit: 1, windowMs: 1_000 },
  provider: { limit: 1, windowMs: 1_000 },
}

function createFixture(initialNowMs = 10_000) {
  const clock = new ManualRateLimitClock(initialNowMs)
  const store = new InMemoryRateLimitStore()
  const limiter = createRateLimiter({ policy, store, clock })
  return { clock, store, limiter }
}

function createStoreWithResult(result: unknown): RateLimitStore {
  const store: RateLimitStore = {
    checkAndConsume: async () => ({
      committed: true,
      buckets: [{
        dimension: 'route',
        allowed: true,
        limit: 100,
        remaining: 99,
        resetAtMs: 11_000,
      }],
    }),
  }
  Object.defineProperty(store, 'checkAndConsume', { value: async () => result })
  return store
}

function createResultLimiter(result: unknown) {
  return createRateLimiter({
    policy,
    store: createStoreWithResult(result),
    clock: new ManualRateLimitClock(10_000),
  })
}

describe('rate-limit dimensions', () => {
  it('tracks route, user, workspace, and provider keys independently', async () => {
    const { limiter } = createFixture()

    await expect(limiter.consume({ route: 'route-a' })).resolves.toMatchObject({ allowed: true })
    await expect(limiter.consume({ route: 'route-a' })).resolves.toMatchObject({
      allowed: true,
    })
    await expect(limiter.consume({ route: 'route-b' })).resolves.toMatchObject({ allowed: true })

    await expect(limiter.consume({ route: 'user-route', userId: 'user-a' })).resolves.toMatchObject({
      allowed: true,
    })
    await expect(limiter.consume({ route: 'user-route', userId: 'user-a' })).resolves.toMatchObject({
      allowed: false,
      rejectedDimension: 'user',
    })
    await expect(limiter.consume({ route: 'user-route', userId: 'user-b' })).resolves.toMatchObject({
      allowed: true,
    })

    await expect(limiter.consume({ route: 'workspace-route', workspaceId: 'workspace-a' })).resolves.toMatchObject({
      allowed: true,
    })
    await expect(limiter.consume({ route: 'workspace-route', workspaceId: 'workspace-a' })).resolves.toMatchObject({
      allowed: false,
      rejectedDimension: 'workspace',
    })
    await expect(limiter.consume({ route: 'workspace-route', workspaceId: 'workspace-b' })).resolves.toMatchObject({
      allowed: true,
    })

    await expect(limiter.consume({ route: 'provider-route', providerCode: 'provider-a' })).resolves.toMatchObject({
      allowed: true,
    })
    await expect(limiter.consume({ route: 'provider-route', providerCode: 'provider-a' })).resolves.toMatchObject({
      allowed: false,
      rejectedDimension: 'provider',
    })
    await expect(limiter.consume({ route: 'provider-route', providerCode: 'provider-b' })).resolves.toMatchObject({
      allowed: true,
    })
  })
})

describe('rate-limit expiry and rejection metadata', () => {
  it('expires a fixed window at the injected clock boundary', async () => {
    const { clock, limiter } = createFixture()

    await expect(limiter.consume({ route: 'expiry-route' })).resolves.toMatchObject({ allowed: true })
    await expect(limiter.consume({ route: 'expiry-route', userId: 'user-a' })).resolves.toMatchObject({
      allowed: true,
    })

    clock.advanceBy(1_000)

    await expect(limiter.consume({ route: 'expiry-route' })).resolves.toMatchObject({
      allowed: true,
      resetAtMs: 12_000,
    })
  })

  it('returns stable retry metadata for a rejected bucket', async () => {
    const { limiter } = createFixture()

    await limiter.consume({ route: 'metadata-route', userId: 'metadata-user' })
    const decision = await limiter.consume({ route: 'metadata-route', userId: 'metadata-user' })

    expect(decision).toMatchObject({
      allowed: false,
      rejectedDimension: 'user',
      rejectedDimensions: ['user'],
      remaining: 0,
      retryAfterMs: 1_000,
      retryAfterSeconds: 1,
      resetAtMs: 11_000,
    })
    expect(decision.buckets).toEqual(expect.arrayContaining([
      expect.objectContaining({
        dimension: 'user',
        limit: 1,
        remaining: 0,
        resetAtMs: 11_000,
      }),
    ]))
  })
})

describe('rate-limit runtime boundaries', () => {
  it('rejects malformed dimension values with typed errors', () => {
    const malformedRequests: readonly object[] = [
      { route: 123 },
      { route: null },
      { route: {} },
      { route: 'safe-route', userId: null },
      { route: 'safe-route', workspaceId: {} },
      { route: 'safe-route', providerCode: [] },
    ]

    for (const request of malformedRequests) {
      expect(() => Reflect.apply(validateRateLimitRequest, undefined, [request])).toThrow(RateLimitRequestError)
    }
  })

  it('rejects malformed policy primitives with a typed error', () => {
    const malformedPolicy = {
      route: { limit: '1', windowMs: 1_000 },
      user: { limit: 1, windowMs: 1_000 },
      workspace: { limit: 1, windowMs: 1_000 },
      provider: { limit: 1, windowMs: 1_000 },
    }

    expect(() => Reflect.apply(validateRateLimitPolicy, undefined, [malformedPolicy])).toThrow(RateLimitPolicyError)
  })

  it('rejects malformed store requests and buckets with typed errors', () => {
    const malformedRequests: readonly unknown[] = [
      null,
      123,
      {},
      { nowMs: 0, buckets: null },
      { nowMs: 0, buckets: {} },
      { nowMs: 0, buckets: [null] },
      { nowMs: 0, buckets: [7] },
      {
        nowMs: 0,
        buckets: [{ dimension: 'bogus', key: 'store-key', policy }],
      },
      {
        nowMs: 0,
        buckets: [{ dimension: 7, key: 'store-key', policy }],
      },
      {
        nowMs: 0,
        buckets: [{ dimension: 'route', key: 7, policy }],
      },
      {
        nowMs: 0,
        buckets: [{ dimension: 'route', key: null, policy }],
      },
      {
        nowMs: 0,
        buckets: [{ dimension: 'route', key: 'x'.repeat(2_049), policy }],
      },
    ]

    for (const request of malformedRequests) {
      expect(() => Reflect.apply(validateStoreRequest, undefined, [request])).toThrow(RateLimitStoreRequestError)
    }
  })

  it('rejects malformed store dimensions and keys at key construction', () => {
    const malformedInputs: readonly (readonly [unknown, unknown])[] = [
      ['bogus', 'route-value'],
      [null, 'route-value'],
      [7, 'route-value'],
      ['route', null],
      ['route', 7],
      ['route', ''],
      ['route', 'x'.repeat(513)],
    ]

    for (const [dimension, value] of malformedInputs) {
      expect(() => Reflect.apply(rateLimitBucketKey, undefined, [dimension, value])).toThrow(RateLimitStoreRequestError)
    }
  })

  it('rejects malformed requests through the store port with typed errors', async () => {
    const store = new InMemoryRateLimitStore()

    await expect(Reflect.apply(store.checkAndConsume, store, [null])).rejects.toBeInstanceOf(RateLimitStoreRequestError)
    await expect(Reflect.apply(store.checkAndConsume, store, [{ nowMs: 0, buckets: null }])).rejects.toBeInstanceOf(
      RateLimitStoreRequestError,
    )
  })

  it('rejects malformed public store results with typed errors', async () => {
    const validBucket = {
      dimension: 'route',
      allowed: true,
      limit: 100,
      remaining: 99,
      resetAtMs: 11_000,
    }
    const malformedResults: readonly unknown[] = [
      null,
      7,
      {},
      { committed: true, buckets: null },
      { committed: true, buckets: [null] },
      { committed: 'true', buckets: [validBucket] },
      { committed: true, buckets: [{ ...validBucket, allowed: 'true' }] },
      { committed: null, buckets: [validBucket] },
      { committed: true, buckets: [{ ...validBucket, limit: {} }] },
      { committed: true, buckets: [{ ...validBucket, limit: 0 }] },
      { committed: true, buckets: [{ ...validBucket, limit: Number.POSITIVE_INFINITY }] },
      { committed: true, buckets: [{ ...validBucket, remaining: null }] },
      { committed: true, buckets: [{ ...validBucket, remaining: -1 }] },
      { committed: true, buckets: [{ ...validBucket, remaining: Number.NaN }] },
      { committed: true, buckets: [{ ...validBucket, resetAtMs: 'nope' }] },
      { committed: true, buckets: [{ ...validBucket, resetAtMs: -1 }] },
      { committed: true, buckets: [{ ...validBucket, resetAtMs: Number.POSITIVE_INFINITY }] },
      { committed: true, buckets: [{ ...validBucket, resetAtMs: Number.MAX_SAFE_INTEGER }] },
      { committed: true, buckets: [{ ...validBucket, resetAtMs: 1_000_000 }] },
      { committed: true, buckets: [{ ...validBucket, dimension: 'bogus' }] },
      { committed: true, buckets: [{ ...validBucket, allowed: false }] },
      { committed: false, buckets: [validBucket] },
      { committed: true, buckets: [{ ...validBucket, remaining: 100 }] },
    ]

    for (const result of malformedResults) {
      await expect(createResultLimiter(result).consume({ route: 'result-route' })).rejects.toBeInstanceOf(
        RateLimitStoreResultError,
      )
    }
  })

  it('rejects duplicate and mismatched public result dimensions', async () => {
    const duplicateDimensions = {
      committed: true,
      buckets: [
        {
          dimension: 'route',
          allowed: true,
          limit: 100,
          remaining: 99,
          resetAtMs: 11_000,
        },
        {
          dimension: 'route',
          allowed: true,
          limit: 100,
          remaining: 99,
          resetAtMs: 11_000,
        },
      ],
    }
    const mismatchedDimensions = {
      committed: true,
      buckets: [
        {
          dimension: 'route',
          allowed: true,
          limit: 100,
          remaining: 99,
          resetAtMs: 11_000,
        },
        {
          dimension: 'provider',
          allowed: true,
          limit: 1,
          remaining: 0,
          resetAtMs: 11_000,
        },
      ],
    }

    await expect(createResultLimiter(duplicateDimensions).consume({
      route: 'result-route',
      userId: 'result-user',
    })).rejects.toBeInstanceOf(RateLimitStoreResultError)
    await expect(createResultLimiter(mismatchedDimensions).consume({
      route: 'result-route',
      userId: 'result-user',
    })).rejects.toBeInstanceOf(RateLimitStoreResultError)
  })

  it('does not echo hostile store result fields into errors or decisions', async () => {
    const secretSentinel = 'SECRET_SENTINEL_RESULT_7dbb'
    const hostileResult = {
      committed: false,
      buckets: [{
        dimension: 'route',
        allowed: false,
        limit: secretSentinel,
        remaining: 0,
        resetAtMs: 11_000,
      }],
    }

    try {
      await createResultLimiter(hostileResult).consume({ route: 'result-route' })
      throw new Error('Expected malformed store result to be rejected.')
    } catch (error) {
      expect(error).toBeInstanceOf(RateLimitStoreResultError)
      if (error instanceof RateLimitStoreResultError) {
        expect(error.message).not.toContain(secretSentinel)
      }
    }
  })

  it('converts throwing result and bucket accessors into typed safe errors', async () => {
    const secretSentinel = 'SECRET_SENTINEL_ACCESSOR_4ca1'
    const resultWithThrowingGetter: Record<string, unknown> = {}
    Object.defineProperty(resultWithThrowingGetter, 'committed', {
      get: () => {
        throw new Error(secretSentinel)
      },
    })
    const bucketWithThrowingGetter = {
      dimension: 'route',
      allowed: true,
      remaining: 99,
      resetAtMs: 11_000,
    }
    Object.defineProperty(bucketWithThrowingGetter, 'limit', {
      get: () => {
        throw new Error(secretSentinel)
      },
    })

    for (const result of [
      resultWithThrowingGetter,
      { committed: true, buckets: [bucketWithThrowingGetter] },
    ]) {
      try {
        await createResultLimiter(result).consume({ route: 'result-route' })
        throw new Error('Expected a throwing store accessor to be rejected.')
      } catch (error) {
        expect(error).toBeInstanceOf(RateLimitStoreResultError)
        if (error instanceof RateLimitStoreResultError) {
          expect(error.message).not.toContain(secretSentinel)
        }
      }
    }
  })

  it('converts throwing result and bucket proxies into typed safe errors', async () => {
    const secretSentinel = 'SECRET_SENTINEL_PROXY_2f7e'
    const validResult = {
      committed: true,
      buckets: [{
        dimension: 'route',
        allowed: true,
        limit: 100,
        remaining: 99,
        resetAtMs: 11_000,
      }],
    }
    const resultProxy = new Proxy(validResult, {
      get: () => {
        throw new Error(secretSentinel)
      },
    })
    const bucketProxy = new Proxy(validResult.buckets[0], {
      get: () => {
        throw new Error(secretSentinel)
      },
    })

    for (const result of [
      resultProxy,
      { committed: true, buckets: [bucketProxy] },
    ]) {
      try {
        await createResultLimiter(result).consume({ route: 'result-route' })
        throw new Error('Expected a throwing store proxy to be rejected.')
      } catch (error) {
        expect(error).toBeInstanceOf(RateLimitStoreResultError)
        if (error instanceof RateLimitStoreResultError) {
          expect(error.message).not.toContain(secretSentinel)
        }
      }
    }
  })
})

describe('rate-limit atomicity', () => {
  it('does not partially consume a rejected multi-dimensional decision', async () => {
    const atomicPolicy: RateLimitPolicy = {
      route: { limit: 1, windowMs: 1_000 },
      user: { limit: 1, windowMs: 10_000 },
      workspace: { limit: 100, windowMs: 1_000 },
      provider: { limit: 100, windowMs: 1_000 },
    }
    const clock = new ManualRateLimitClock(10_000)
    const store = new InMemoryRateLimitStore()
    const limiter = createRateLimiter({ policy: atomicPolicy, store, clock })

    await expect(limiter.consume({ route: 'atomic-route', userId: 'user-a' })).resolves.toMatchObject({
      allowed: true,
    })
    await expect(limiter.consume({ route: 'atomic-route', userId: 'user-b' })).resolves.toMatchObject({
      allowed: false,
      rejectedDimension: 'route',
    })

    clock.advanceBy(1_000)

    const retry = await limiter.consume({ route: 'atomic-route', userId: 'user-b' })
    expect(retry).toMatchObject({ allowed: true })
    expect(retry.buckets).toEqual(expect.arrayContaining([
      expect.objectContaining({
        dimension: 'user',
        remaining: 0,
        resetAtMs: 21_000,
      }),
    ]))
  })

  it('serializes concurrent decisions through the store port without sleeping', async () => {
    const concurrentPolicy: RateLimitPolicy = {
      route: { limit: 3, windowMs: 1_000 },
      user: { limit: 100, windowMs: 1_000 },
      workspace: { limit: 100, windowMs: 1_000 },
      provider: { limit: 100, windowMs: 1_000 },
    }
    const clock = new ManualRateLimitClock(20_000)
    const store = new InMemoryRateLimitStore()
    const limiter = createRateLimiter({ policy: concurrentPolicy, store, clock })

    const decisions = await Promise.all(
      Array.from({ length: 20 }, () => limiter.consume({ route: 'concurrent-route' })),
    )

    expect(decisions.filter((decision) => decision.allowed)).toHaveLength(3)
    expect(decisions.filter((decision) => !decision.allowed)).toHaveLength(17)
    expect(decisions.filter((decision) => !decision.allowed).every((decision) => decision.retryAfterMs === 1_000)).toBe(true)
  })
})
