import { randomUUID } from 'node:crypto'
import { normalizeAgentRuntimeError } from './agent-runtime/contracts.js'
import type {
  AgentRunOptions,
  DesktopAgentProvider,
  DesktopProviderId,
  NormalizedAgentEvent,
  ProviderHealth,
} from './agent-runtime/contracts.js'
import type { DesktopAgentEvent, DesktopProviderHealth } from './ipc.js'

export type DesktopAgentOwner = {
  id: number
  isDestroyed(): boolean
  send(channel: string, event: DesktopAgentEvent): void
}

export type DesktopAgentStart = Omit<AgentRunOptions, 'runId' | 'cwd' | 'signal'> & {
  providerId: DesktopProviderId
}

export type DesktopAgentServiceOptions = {
  workspaceRoot: string
  providers: readonly DesktopAgentProvider[]
  eventChannel: string
  healthTtlMs?: number
  maxRunsPerOwner?: number
  maxGlobalRuns?: number
  createRunId?: () => string
}

type ActiveRun = {
  readonly runId: string
  readonly owner: DesktopAgentOwner
  readonly provider: DesktopAgentProvider
  readonly controller: AbortController
  completion: Promise<void>
}

type CachedHealth = {
  readonly value: DesktopProviderHealth
  readonly expiresAt: number
}

const ALL_PROVIDER_IDS: readonly DesktopProviderId[] = ['claude-code', 'codex', 'agy']

export function publicProviderHealth(value: ProviderHealth): DesktopProviderHealth {
  return {
    providerId: value.providerId,
    status: value.status,
    detected: Boolean(value.executablePath),
    authenticated: value.authenticated,
    checkedAt: value.checkedAt,
    // Provider implementations must not be able to expose absolute paths or
    // diagnostic text through the renderer health surface.
    message: value.status === 'healthy'
      ? '에이전트와 인증 상태를 확인했습니다.'
      : value.status === 'limited'
        ? '에이전트는 일부 기능만 사용할 수 있습니다.'
        : '에이전트를 사용할 수 없습니다.',
  }
}

function internalFailure(runId: string, providerId: DesktopProviderId): readonly NormalizedAgentEvent[] {
  const occurredAt = new Date().toISOString()
  const error = {
    type: 'error' as const,
    runId,
    occurredAt,
    providerId,
    metadata: {},
    retryable: true,
    error: {
      code: 'process-start-failed' as const,
      message: '에이전트를 시작하지 못했습니다.',
      retryable: true,
    },
  }
  return [
    error,
    { type: 'done', runId, occurredAt: new Date().toISOString(), providerId, metadata: {}, retryable: true, outcome: 'error' as const },
  ]
}

/** Owns desktop CLI runs independently from Electron IPC and BrowserWindows. */
export class DesktopAgentService {
  private readonly workspaceRoot: string
  private readonly providers = new Map<DesktopProviderId, DesktopAgentProvider>()
  private readonly eventChannel: string
  private readonly healthTtlMs: number
  private readonly maxRunsPerOwner: number
  private readonly maxGlobalRuns: number
  private readonly createRunId: () => string
  private readonly activeRuns = new Map<string, ActiveRun>()
  private readonly ownerRuns = new Map<number, Set<string>>()
  private readonly healthCache = new Map<DesktopProviderId, CachedHealth>()
  private readonly healthRequests = new Map<DesktopProviderId, Promise<DesktopProviderHealth>>()
  private shuttingDown = false

  constructor(options: DesktopAgentServiceOptions) {
    this.workspaceRoot = options.workspaceRoot
    this.eventChannel = options.eventChannel
    this.healthTtlMs = options.healthTtlMs ?? 30_000
    this.maxRunsPerOwner = options.maxRunsPerOwner ?? 1
    this.maxGlobalRuns = options.maxGlobalRuns ?? 3
    this.createRunId = options.createRunId ?? randomUUID
    for (const provider of options.providers) this.providers.set(provider.id, provider)
    for (const providerId of ALL_PROVIDER_IDS) {
      if (!this.providers.has(providerId)) throw new Error('Desktop agent providers are incomplete.')
    }
  }

  async getProviderHealth(refresh = false): Promise<readonly DesktopProviderHealth[]> {
    return Promise.all(ALL_PROVIDER_IDS.map((providerId) => this.healthFor(providerId, refresh)))
  }

  start(owner: DesktopAgentOwner, request: DesktopAgentStart): string {
    if (this.shuttingDown) throw new Error('데스크톱 에이전트가 종료 중입니다.')
    if (owner.isDestroyed()) throw new Error('데스크톱 창을 사용할 수 없습니다.')
    const ownerRunCount = this.ownerRuns.get(owner.id)?.size ?? 0
    if (ownerRunCount >= this.maxRunsPerOwner) throw new Error('이 데스크톱 창에 이미 실행 중인 에이전트가 있습니다.')
    if (this.activeRuns.size >= this.maxGlobalRuns) throw new Error('실행 중인 데스크톱 에이전트가 너무 많습니다.')

    const provider = this.providers.get(request.providerId)
    if (!provider) throw new Error('데스크톱 에이전트를 사용할 수 없습니다.')
    const runId = this.createRunId()
    if (this.activeRuns.has(runId)) throw new Error('같은 데스크톱 에이전트 실행이 이미 존재합니다.')

    const controller = new AbortController()
    const active: ActiveRun = {
      runId,
      owner,
      provider,
      controller,
      completion: Promise.resolve(),
    }
    this.activeRuns.set(runId, active)
    let ownerSet = this.ownerRuns.get(owner.id)
    if (!ownerSet) {
      ownerSet = new Set()
      this.ownerRuns.set(owner.id, ownerSet)
    }
    ownerSet.add(runId)
    active.completion = this.consume(runId, owner, provider, request, controller)
    void active.completion
    return runId
  }

  cancel(owner: DesktopAgentOwner, runId: string): boolean {
    const active = this.activeRuns.get(runId)
    if (!active || active.owner.id !== owner.id) return false
    active.controller.abort()
    return true
  }

  cancelOwner(ownerId: number): void {
    for (const runId of [...(this.ownerRuns.get(ownerId) ?? [])]) this.activeRuns.get(runId)?.controller.abort()
  }

  cancelAll(): void {
    for (const active of this.activeRuns.values()) active.controller.abort()
  }

  async shutdown(): Promise<void> {
    this.shuttingDown = true
    this.cancelAll()
    await Promise.allSettled([...this.activeRuns.values()].map((active) => active.completion))
  }

  activeRunCount(): number {
    return this.activeRuns.size
  }

  private async healthFor(providerId: DesktopProviderId, refresh: boolean): Promise<DesktopProviderHealth> {
    const cached = this.healthCache.get(providerId)
    if (!refresh && cached && cached.expiresAt > Date.now()) return cached.value
    const inFlight = this.healthRequests.get(providerId)
    if (inFlight) return inFlight

    const provider = this.providers.get(providerId)
    if (!provider) throw new Error('데스크톱 에이전트를 사용할 수 없습니다.')
    const request = provider.healthCheck().then((health) => {
      const publicHealth = publicProviderHealth(health)
      this.healthCache.set(providerId, { value: publicHealth, expiresAt: Date.now() + this.healthTtlMs })
      return publicHealth
    }).catch(() => {
      const fallback: DesktopProviderHealth = {
        providerId,
        status: 'failed',
        detected: false,
        authenticated: false,
        checkedAt: new Date().toISOString(),
        message: '에이전트 상태를 확인하지 못했습니다.',
      }
      this.healthCache.set(providerId, { value: fallback, expiresAt: Date.now() + this.healthTtlMs })
      return fallback
    }).finally(() => {
      this.healthRequests.delete(providerId)
    })
    this.healthRequests.set(providerId, request)
    return request
  }

  private async consume(
    runId: string,
    owner: DesktopAgentOwner,
    provider: DesktopAgentProvider,
    request: DesktopAgentStart,
    controller: AbortController,
  ): Promise<void> {
    try {
      for await (const event of provider.run({ ...request, runId, cwd: this.workspaceRoot, signal: controller.signal })) {
        this.route(owner, event)
      }
    } catch {
      for (const event of internalFailure(runId, provider.id)) this.route(owner, event)
    } finally {
      this.activeRuns.delete(runId)
      const ownerSet = this.ownerRuns.get(owner.id)
      ownerSet?.delete(runId)
      if (ownerSet?.size === 0) this.ownerRuns.delete(owner.id)
    }
  }

  private route(owner: DesktopAgentOwner, event: NormalizedAgentEvent): void {
    if (owner.isDestroyed()) return
    const safeEvent: NormalizedAgentEvent = event.type === 'error'
      ? (() => {
        const error = normalizeAgentRuntimeError(event.error)
        return { ...event, retryable: error.retryable, error }
      })()
      : event
    try {
      owner.send(this.eventChannel, safeEvent)
    } catch {
      // A WebContents can be destroyed between the check above and send().
    }
  }
}
