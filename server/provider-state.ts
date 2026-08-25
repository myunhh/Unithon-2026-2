import type { SupabaseClient } from '@supabase/supabase-js'
import type { ServerEnv } from './env.js'
import { createServerSupabaseClient } from './supabase.js'
import { ProviderCredentialCipher } from './providers/crypto.js'
import {
  ProviderStateRepository,
  type OptimisticStateGateway,
  type OptimisticStateRecord,
} from './providers/repository.js'

export type ProviderRepositoryFactory = (sessionId: string) => ProviderStateRepository | null

/**
 * Maps the shared numeric Supabase platform-state revision contract onto the
 * provider core's string revision seam. The provider repository itself owns
 * the paperbridge:providers:<signed-session-id> namespace.
 */
export function createSupabaseProviderStateGateway(client: SupabaseClient): OptimisticStateGateway {
  return {
    async read(stateId) {
      const { data, error } = await client
        .from('opencowork_platform_state')
        .select('data, revision')
        .eq('id', stateId)
        .maybeSingle()
      if (error) throw new Error('Provider state storage is unavailable.')
      if (!data) return null
      if (!validRevision(data.revision)) throw new Error('Provider state storage is unavailable.')
      return { revision: String(data.revision), value: data.data }
    },
    async compareAndSet(stateId, expectedRevision, value) {
      const expected = expectedRevision === null ? 0 : numericRevision(expectedRevision)
      const { data, error } = await client.rpc('save_opencowork_platform_state', {
        p_id: stateId,
        p_expected_revision: expected,
        p_data: value,
      })
      if (error) {
        if (isRevisionConflict(error)) return null
        throw new Error('Provider state storage is unavailable.')
      }
      const revision = savedRevision(data, expected)
      return revision === null ? null : { revision: String(revision), value }
    },
  }
}

/** Creates one reusable Supabase-backed provider repository factory for a server. */
export function createProviderRepositoryFactory(
  environment: ServerEnv,
  client: SupabaseClient | null = createServerSupabaseClient(environment),
): ProviderRepositoryFactory {
  if (!client || !environment.providerEncryptionKey) return () => null
  const gateway = createSupabaseProviderStateGateway(client)
  const cipher = new ProviderCredentialCipher(environment.providerEncryptionKey)
  return () => new ProviderStateRepository({ gateway, cipher })
}

function validRevision(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function numericRevision(value: string): number {
  if (!/^[0-9]+$/.test(value)) throw new Error('Provider state storage is unavailable.')
  const revision = Number(value)
  if (!Number.isSafeInteger(revision) || revision < 0) throw new Error('Provider state storage is unavailable.')
  return revision
}

function isRevisionConflict(error: { code?: string; message?: string }): boolean {
  const detail = `${error.code ?? ''} ${error.message ?? ''}`.toLowerCase()
  return detail.includes('revision') || detail.includes('concurrent') || detail.includes('expected')
}

function savedRevision(value: unknown, expected: number): number | null {
  if (validRevision(value)) return value > expected ? value : null
  if (value === true) {
    const next = expected + 1
    return validRevision(next) ? next : null
  }
  const record = Array.isArray(value) ? value[0] : value
  if (isRecord(record) && validRevision(record.revision)) return record.revision > expected ? record.revision : null
  return null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export type { OptimisticStateGateway, OptimisticStateRecord }
