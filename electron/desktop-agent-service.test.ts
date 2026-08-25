import { describe, expect, it } from 'vitest'
import type {
  AgentRunOptions,
  DesktopAgentProvider,
  DesktopProviderId,
  NormalizedAgentEvent,
  ProviderHealth,
} from './agent-runtime/contracts.js'
import { IPC_CHANNELS, type DesktopAgentEvent } from './ipc.js'
import { DesktopAgentService, type DesktopAgentOwner } from './desktop-agent-service.js'

class FakeOwner implements DesktopAgentOwner {
  destroyed = false
  readonly sent: Array<{ channel: string; event: DesktopAgentEvent }> = []

  constructor(readonly id: number) {}

  isDestroyed(): boolean {
    return this.destroyed
  }

  send(channel: string, event: DesktopAgentEvent): void {
    this.sent.push({ channel, event })
  }
}

type RunControl = {
  complete(): void
}

class FakeProvider implements DesktopAgentProvider {
  healthChecks = 0
  readonly runCalls: AgentRunOptions[] = []
  private readonly controls = new Map<string, RunControl>()

  constructor(readonly id: DesktopProviderId, private readonly executablePath = '/Users/example/bin/provider') {}

  async healthCheck(): Promise<ProviderHealth> {
    this.healthChecks += 1
    return {
      providerId: this.id,
      status: 'healthy',
      executablePath: this.executablePath,
      authenticated: true,
      checkedAt: '2026-08-25T00:00:00.000Z',
      message: 'ready at /Users/example/secret-diagnostic',
    }
  }

  async *run(options: AgentRunOptions): AsyncIterable<NormalizedAgentEvent> {
    this.runCalls.push(options)
    yield { type: 'started', runId: options.runId, occurredAt: '2026-08-25T00:00:00.000Z', providerId: this.id, metadata: {}, retryable: false }
    const outcome = await new Promise<'complete' | 'cancelled'>((resolve) => {
      const onAbort = () => resolve('cancelled')
      if (options.signal?.aborted) onAbort()
      else options.signal?.addEventListener('abort', onAbort, { once: true })
      this.controls.set(options.runId, { complete: () => resolve('complete') })
    })
    this.controls.delete(options.runId)
    if (outcome === 'cancelled') {
      yield {
        type: 'error',
        runId: options.runId,
        occurredAt: '2026-08-25T00:00:01.000Z',
        providerId: this.id,
        metadata: {},
        retryable: true,
        error: { code: 'process-cancelled', message: 'cancelled', retryable: true },
      }
      yield { type: 'done', runId: options.runId, occurredAt: '2026-08-25T00:00:01.000Z', providerId: this.id, metadata: {}, retryable: true, outcome: 'cancelled' }
      return
    }
    yield { type: 'result', runId: options.runId, occurredAt: '2026-08-25T00:00:01.000Z', providerId: this.id, metadata: {}, retryable: false, text: 'done' }
    yield { type: 'done', runId: options.runId, occurredAt: '2026-08-25T00:00:01.000Z', providerId: this.id, metadata: {}, retryable: false, outcome: 'success' }
  }
}

function providers(): Record<DesktopProviderId, FakeProvider> {
  return {
    'claude-code': new FakeProvider('claude-code'),
    codex: new FakeProvider('codex'),
    agy: new FakeProvider('agy'),
  }
}

function makeService(
  providerSet = providers(),
  options: Partial<ConstructorParameters<typeof DesktopAgentService>[0]> = {},
): DesktopAgentService {
  return new DesktopAgentService({
    workspaceRoot: '/agent-workspace',
    providers: Object.values(providerSet),
    eventChannel: IPC_CHANNELS.desktopAgentRunEvent,
    ...options,
  })
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await new Promise((resolve) => setTimeout(resolve, 0))
}

const request = { providerId: 'agy' as const, prompt: 'summarize safely' }

describe('DesktopAgentService', () => {
  it('redacts executable paths, caches health, refreshes explicitly, and includes agy', async () => {
    const providerSet = providers()
    const service = makeService(providerSet)

    const first = await service.getProviderHealth()
    const cached = await service.getProviderHealth()
    const refreshed = await service.getProviderHealth(true)

    expect(first.map((health) => health.providerId)).toEqual(['claude-code', 'codex', 'agy'])
    expect(first).not.toHaveProperty('0.executablePath')
    expect(JSON.stringify(first)).not.toContain('/Users/example')
    expect(first.every((health) => /[가-힣]/.test(health.message))).toBe(true)
    expect(JSON.stringify(first)).not.toContain('secret-diagnostic')
    expect(cached).toEqual(first)
    expect(refreshed).toEqual(first)
    expect(providerSet.agy.healthChecks).toBe(2)
    expect(providerSet.codex.healthChecks).toBe(2)
    expect(providerSet['claude-code'].healthChecks).toBe(2)
  })

  it('routes events only to the owner and cancels exact owner runs on cleanup', async () => {
    const providerSet = providers()
    const service = makeService(providerSet)
    const owner = new FakeOwner(11)
    const otherOwner = new FakeOwner(12)
    const runId = service.start(owner, request)
    await flush()

    expect(owner.sent).toMatchObject([{ channel: IPC_CHANNELS.desktopAgentRunEvent, event: { type: 'started', runId } }])
    expect(otherOwner.sent).toEqual([])
    expect(service.cancel(otherOwner, runId)).toBe(false)

    service.cancelOwner(owner.id)
    await flush()
    expect(owner.sent.map((entry) => entry.event.type)).toEqual(['started', 'error', 'done'])
    const errorEvent = owner.sent.find((entry) => entry.event.type === 'error')?.event
    expect(errorEvent?.type).toBe('error')
    if (errorEvent?.type === 'error') {
      expect(errorEvent.error.message).toBe('에이전트 실행이 취소되었습니다.')
      expect(errorEvent.error.message).not.toContain('cancelled')
    }
    expect(service.activeRunCount()).toBe(0)
  })

  it('does not route cleanup events after the owning window is destroyed', async () => {
    const service = makeService()
    const owner = new FakeOwner(13)
    service.start(owner, request)
    await flush()
    owner.destroyed = true
    service.cancelOwner(owner.id)
    await flush()

    expect(owner.sent.map((entry) => entry.event.type)).toEqual(['started'])
    expect(service.activeRunCount()).toBe(0)
  })

  it('rejects duplicate IDs and per-window/global concurrency overflow', async () => {
    const ids = [
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000003',
    ]
    const service = makeService(providers(), {
      createRunId: () => ids.shift() ?? '00000000-0000-4000-8000-000000000004',
      maxRunsPerOwner: 1,
      maxGlobalRuns: 2,
    })
    const first = new FakeOwner(21)
    const second = new FakeOwner(22)
    const third = new FakeOwner(23)

    service.start(first, request)
    expect(() => service.start(second, request)).toThrow('같은 데스크톱 에이전트 실행이 이미 존재합니다.')
    service.start(second, request)
    expect(() => service.start(first, request)).toThrow('이 데스크톱 창에 이미 실행 중인 에이전트가 있습니다.')
    expect(() => service.start(third, request)).toThrow('실행 중인 데스크톱 에이전트가 너무 많습니다.')
    await service.shutdown()
    expect(() => service.start(third, request)).toThrow('데스크톱 에이전트가 종료 중입니다.')
  })
})
