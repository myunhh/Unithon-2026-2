import { describe, expect, it } from 'vitest'
import { ProviderCredentialCipher } from './crypto.js'
import {
  ProviderStateError,
  ProviderStateRepository,
  type OptimisticStateGateway,
  type OptimisticStateRecord,
} from './repository.js'

const sessionId = '0123456789abcdefghijklmnopqrstuv'
const providerKey = 'sk-or-v1-repository-key-that-must-not-appear-in-state'

class InMemoryOptimisticGateway implements OptimisticStateGateway {
  readonly records = new Map<string, OptimisticStateRecord>()
  compareCalls = 0
  conflictsRemaining = 0

  async read(stateId: string): Promise<OptimisticStateRecord | null> {
    const record = this.records.get(stateId)
    return record ? structuredClone(record) : null
  }

  async compareAndSet(
    stateId: string,
    expectedRevision: string | null,
    value: unknown,
  ): Promise<OptimisticStateRecord | null> {
    this.compareCalls += 1
    if (this.conflictsRemaining > 0) {
      this.conflictsRemaining -= 1
      return null
    }
    const current = this.records.get(stateId)
    if ((current?.revision ?? null) !== expectedRevision) return null
    const next = { revision: String(Number(current?.revision ?? '0') + 1), value: structuredClone(value) }
    this.records.set(stateId, next)
    return structuredClone(next)
  }
}

function createRepository(gateway: InMemoryOptimisticGateway, maxOptimisticRetries?: number) {
  return new ProviderStateRepository({
    gateway,
    cipher: new ProviderCredentialCipher(`base64url:${Buffer.alloc(32, 4).toString('base64url')}`),
    maxOptimisticRetries,
  })
}

describe('ProviderStateRepository', () => {
  it('uses a namespaced session state id and stores only an encrypted envelope and model id', async () => {
    const gateway = new InMemoryOptimisticGateway()
    const repository = createRepository(gateway)

    await expect(repository.saveOpenRouter(sessionId, { apiKey: providerKey, modelId: 'openai/gpt-4o-mini' })).resolves.toEqual({
      openRouter: { configured: true, modelId: 'openai/gpt-4o-mini' },
    })

    const stored = gateway.records.get(`paperbridge:providers:${sessionId}`)
    expect(stored?.revision).toBe('1')
    expect(stored?.value).toEqual({
      v: 1,
      openRouter: {
        apiKey: expect.objectContaining({ v: 1, alg: 'A256GCM' }),
        modelId: 'openai/gpt-4o-mini',
      },
    })
    expect(JSON.stringify(stored)).not.toContain(providerKey)
    expect(JSON.stringify(await repository.load(sessionId))).not.toContain(providerKey)

    const observed = await repository.withOpenRouterCredential(sessionId, (credential) => {
      expect(JSON.stringify(credential)).toEqual('{"configured":true,"modelId":"openai/gpt-4o-mini"}')
      return credential.useApiKey((apiKey) => apiKey)
    })
    expect(observed).toBe(providerKey)
  })

  it('retries bounded optimistic conflicts and preserves the encrypted credential when changing preferences', async () => {
    const gateway = new InMemoryOptimisticGateway()
    const repository = createRepository(gateway, 3)
    gateway.conflictsRemaining = 2

    await repository.saveOpenRouter(sessionId, { apiKey: providerKey, modelId: 'openai/gpt-4o-mini' })
    expect(gateway.compareCalls).toBe(3)
    const beforePreferenceChange = JSON.stringify(gateway.records.get(`paperbridge:providers:${sessionId}`)?.value)

    await repository.setOpenRouterPreferences(sessionId, { modelId: 'anthropic/claude-3.5-haiku' })
    const afterPreferenceChange = JSON.stringify(gateway.records.get(`paperbridge:providers:${sessionId}`)?.value)
    expect(afterPreferenceChange).toContain('anthropic/claude-3.5-haiku')
    expect(afterPreferenceChange).toContain(JSON.parse(beforePreferenceChange).openRouter.apiKey.ciphertext)
    expect(afterPreferenceChange).not.toContain(providerKey)
  })

  it('fails after the configured number of optimistic conflicts without leaking plaintext', async () => {
    const gateway = new InMemoryOptimisticGateway()
    const repository = createRepository(gateway, 2)
    gateway.conflictsRemaining = 3

    await expect(repository.saveOpenRouter(sessionId, { apiKey: providerKey, modelId: 'openai/gpt-4o-mini' })).rejects.toMatchObject({
      code: 'conflict',
    } satisfies Partial<ProviderStateError>)
    expect(gateway.compareCalls).toBe(2)
    await expect(repository.load(sessionId)).resolves.toEqual({ openRouter: null })
  })
})
