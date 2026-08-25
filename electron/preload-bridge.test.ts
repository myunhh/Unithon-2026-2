import { describe, expect, it } from 'vitest'
import { IPC_CHANNELS, type DesktopAgentEvent } from './ipc.js'
import { createDesktopBridge, type DesktopIpcRenderer } from './preload-bridge.js'

class FakeIpcRenderer implements DesktopIpcRenderer {
  readonly listeners = new Map<string, Set<(event: unknown, payload: unknown) => void>>()

  async invoke(_channel: string, ..._arguments: readonly unknown[]): Promise<unknown> {
    return undefined
  }

  on(channel: string, listener: (event: unknown, payload: unknown) => void): void {
    const listeners = this.listeners.get(channel) ?? new Set()
    listeners.add(listener)
    this.listeners.set(channel, listeners)
  }

  removeListener(channel: string, listener: (event: unknown, payload: unknown) => void): void {
    this.listeners.get(channel)?.delete(listener)
  }

  emit(payload: unknown): void {
    for (const listener of this.listeners.get(IPC_CHANNELS.desktopAgentRunEvent) ?? []) listener({}, payload)
  }
}

const validStartedEvent: DesktopAgentEvent = {
  type: 'started',
  runId: '123e4567-e89b-42d3-a456-426614174000',
  occurredAt: '2026-08-25T00:00:00.000Z',
  providerId: 'codex',
  metadata: { thread_id: 'thread-1', model: 'gpt-5' },
  retryable: false,
}

describe('desktop preload bridge', () => {
  it('delivers only complete, bounded, allowlisted agent events', () => {
    const ipc = new FakeIpcRenderer()
    const bridge = createDesktopBridge(ipc)
    const delivered: DesktopAgentEvent[] = []
    bridge.subscribeDesktopAgentRun((event) => delivered.push(event))

    ipc.emit(validStartedEvent)
    const validResult: DesktopAgentEvent = { ...validStartedEvent, type: 'result', text: 'safe response' }
    const validError: DesktopAgentEvent = {
      ...validStartedEvent,
      type: 'error',
      retryable: true,
      error: { code: 'process-exited', message: '에이전트가 완료된 응답을 반환하지 않았습니다.', retryable: true },
    }
    const validDone: DesktopAgentEvent = { ...validStartedEvent, type: 'done', outcome: 'error', retryable: true }
    ipc.emit(validResult)
    ipc.emit(validError)
    ipc.emit(validDone)
    ipc.emit({ ...validStartedEvent, providerId: 'openrouter' })
    ipc.emit({ ...validStartedEvent, runId: 'not-a-uuid' })
    ipc.emit({ ...validStartedEvent, occurredAt: 'tomorrow' })
    ipc.emit({ ...validStartedEvent, metadata: { apiKey: 'must-not-reach-ui' } })
    ipc.emit({ ...validStartedEvent, metadata: { model: 'x'.repeat(257) } })
    ipc.emit({ ...validStartedEvent, type: 'result', text: 'ok', injected: true })
    ipc.emit({ ...validStartedEvent, type: 'error', error: { code: 'process-exited', message: 'x'.repeat(513), retryable: false } })

    expect(delivered).toEqual([validStartedEvent, validResult, validError, validDone])
  })

  it('preserves subscribe and unsubscribe identity without duplicate listeners', () => {
    const ipc = new FakeIpcRenderer()
    const bridge = createDesktopBridge(ipc)
    const delivered: DesktopAgentEvent[] = []
    const listener = (event: DesktopAgentEvent) => delivered.push(event)

    bridge.subscribeDesktopAgentRun(listener)
    bridge.subscribeDesktopAgentRun(listener)
    expect(ipc.listeners.get(IPC_CHANNELS.desktopAgentRunEvent)?.size).toBe(1)
    ipc.emit(validStartedEvent)
    expect(delivered).toEqual([validStartedEvent])

    bridge.unsubscribeDesktopAgentRun(listener)
    expect(ipc.listeners.get(IPC_CHANNELS.desktopAgentRunEvent)?.size).toBe(0)
    ipc.emit(validStartedEvent)
    expect(delivered).toEqual([validStartedEvent])

    bridge.subscribeDesktopAgentRun(listener)
    ipc.emit(validStartedEvent)
    expect(delivered).toEqual([validStartedEvent, validStartedEvent])
  })
})
