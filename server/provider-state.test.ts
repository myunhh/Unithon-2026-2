import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { loadServerEnv } from './env.js'
import { createProviderRepositoryFactory, createSupabaseProviderStateGateway } from './provider-state.js'

function fakeClient(options: { row?: { revision: number; data: unknown }; rpcData?: unknown; rpcError?: { code?: string; message?: string } }) {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = []
  const client = {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: options.row ?? null, error: null }),
        }),
      }),
    }),
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args })
      return { data: options.rpcData, error: options.rpcError ?? null }
    },
  } as unknown as SupabaseClient
  return { client, calls }
}

describe('Supabase provider-state gateway', () => {
  it('reads the shared state row and saves through the optimistic revision RPC', async () => {
    const { client, calls } = fakeClient({ row: { revision: 4, data: { v: 1 } }, rpcData: 5 })
    const gateway = createSupabaseProviderStateGateway(client)

    await expect(gateway.read('paperbridge:providers:session')).resolves.toEqual({ revision: '4', value: { v: 1 } })
    await expect(gateway.compareAndSet('paperbridge:providers:session', '4', { v: 1 })).resolves.toEqual({ revision: '5', value: { v: 1 } })
    expect(calls).toEqual([{
      name: 'save_opencowork_platform_state',
      args: { p_id: 'paperbridge:providers:session', p_expected_revision: 4, p_data: { v: 1 } },
    }])
  })

  it('returns a conflict for the existing revision-RPC contention signal', async () => {
    const { client } = fakeClient({ rpcError: { code: 'P0001', message: 'expected revision differs' } })
    await expect(createSupabaseProviderStateGateway(client).compareAndSet('state', null, { v: 1 })).resolves.toBeNull()
  })

  it('does not treat a malformed or unchanged storage revision as an empty successful state', async () => {
    const malformed = fakeClient({ row: { revision: Number.NaN, data: { v: 1 } } })
    await expect(createSupabaseProviderStateGateway(malformed.client).read('state')).rejects.toThrow('unavailable')

    const unchanged = fakeClient({ rpcData: 4 })
    await expect(createSupabaseProviderStateGateway(unchanged.client).compareAndSet('state', '4', { v: 1 })).resolves.toBeNull()

    const nonFinite = fakeClient({ rpcData: Infinity })
    await expect(createSupabaseProviderStateGateway(nonFinite.client).compareAndSet('state', '0', { v: 1 })).resolves.toBeNull()
  })

  it('keeps provider persistence disabled when Supabase or the parsed encryption key is absent', () => {
    const noKey = loadServerEnv({
      APP_ORIGINS: 'http://127.0.0.1:5173',
      PAPERBRIDGE_SESSION_SECRET: 'test-only-provider-session-secret',
      SUPABASE_URL: 'https://project.supabase.co',
      SUPABASE_SECRET_KEY: 'test-only-service-key',
    })
    expect(createProviderRepositoryFactory(noKey, fakeClient({}).client)('0123456789abcdefghijklmnopqrstuv')).toBeNull()

    const configured = loadServerEnv({
      APP_ORIGINS: 'http://127.0.0.1:5173',
      PAPERBRIDGE_SESSION_SECRET: 'test-only-provider-session-secret',
      SUPABASE_URL: 'https://project.supabase.co',
      SUPABASE_SECRET_KEY: 'test-only-service-key',
      PAPERBRIDGE_ENCRYPTION_KEY: `base64url:${Buffer.alloc(32, 6).toString('base64url')}`,
    })
    expect(createProviderRepositoryFactory(configured, fakeClient({}).client)('0123456789abcdefghijklmnopqrstuv')).not.toBeNull()
  })
})
