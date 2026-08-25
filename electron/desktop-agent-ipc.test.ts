import { describe, expect, it } from 'vitest'
import {
  parseDesktopAgentRunId,
  parseDesktopAgentRunRequest,
  parseGetDesktopProviderHealthOptions,
  registerDesktopAgentIpc,
} from './desktop-agent-ipc.js'
import { IPC_CHANNELS } from './ipc.js'

describe('desktop agent IPC validation', () => {
  it('accepts a bounded Agy request without execution controls', () => {
    expect(parseDesktopAgentRunRequest({
      providerId: 'agy',
      prompt: 'Explain this paragraph.',
      model: 'gemini-3.7-flash-high',
      effort: 'high',
      agent: 'researcher',
      conversationId: '123e4567-e89b-42d3-a456-426614174000',
      printTimeout: '90s',
      timeoutMs: 120_000,
    })).toEqual({
      providerId: 'agy',
      prompt: 'Explain this paragraph.',
      model: 'gemini-3.7-flash-high',
      effort: 'high',
      agent: 'researcher',
      conversationId: '123e4567-e89b-42d3-a456-426614174000',
      printTimeout: '90s',
      timeoutMs: 120_000,
    })
  })

  it('rejects executable, cwd, argv, environment, permissions, and oversized controls', () => {
    const base = { providerId: 'codex', prompt: 'safe request' }
    for (const extra of [
      { executable: 'node' },
      { cwd: '/tmp' },
      { args: ['--unsafe'] },
      { env: { OPENAI_API_KEY: 'secret' } },
      { permissionMode: 'bypass' },
      { printTimeout: '16m' },
      { timeoutMs: 900_001 },
    ]) {
      expect(() => parseDesktopAgentRunRequest({ ...base, ...extra })).toThrow('데스크톱 에이전트 요청 형식이 올바르지 않습니다.')
    }
  })

  it('validates health refresh and UUID-only cancellation IDs', () => {
    expect(parseGetDesktopProviderHealthOptions(undefined)).toEqual({})
    expect(parseGetDesktopProviderHealthOptions({ refresh: true })).toEqual({ refresh: true })
    expect(() => parseGetDesktopProviderHealthOptions({ refresh: 'yes' })).toThrow('에이전트 상태 요청 형식이 올바르지 않습니다.')
    expect(parseDesktopAgentRunId('123e4567-e89b-42d3-a456-426614174000')).toBe('123e4567-e89b-42d3-a456-426614174000')
    expect(() => parseDesktopAgentRunId('not-a-uuid')).toThrow('데스크톱 에이전트 실행 식별자가 올바르지 않습니다.')
  })

  it('rejects subframe and cross-origin callers before reaching the service', async () => {
    const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>()
    const service = {
      getProviderHealth: async () => [{ providerId: 'agy', status: 'healthy', detected: true, authenticated: true, checkedAt: '', message: '' }],
      start: () => '123e4567-e89b-42d3-a456-426614174000',
      cancel: () => true,
    }
    registerDesktopAgentIpc({
      ipcMain: { handle: (channel, listener) => handlers.set(channel, listener as (event: unknown, ...args: unknown[]) => unknown) },
      service: service as never,
      isAllowedOrigin: (url) => url === 'http://127.0.0.1:43123',
    })
    const sender = { isDestroyed: () => false }
    const mainFrame = { url: 'http://127.0.0.1:43123' }
    const health = handlers.get(IPC_CHANNELS.getDesktopProviderHealth)!

    expect(() => health({ sender, senderFrame: { url: 'http://127.0.0.1:43123' } })).toThrow('허용되지 않은 창에서 데스크톱 요청을 보냈습니다.')
    expect(() => health({ sender, senderFrame: mainFrame })).toThrow('허용되지 않은 창에서 데스크톱 요청을 보냈습니다.')
    const trustedEvent = { sender: { ...sender, mainFrame }, senderFrame: mainFrame }
    await expect(health(trustedEvent)).resolves.toEqual([
      { providerId: 'agy', status: 'healthy', detected: true, authenticated: true, checkedAt: '', message: '' },
    ])
  })

  it('does not forward unexpected service exception text to the renderer', () => {
    const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>()
    registerDesktopAgentIpc({
      ipcMain: { handle: (channel, listener) => handlers.set(channel, listener as (event: unknown, ...args: unknown[]) => unknown) },
      service: {
        getProviderHealth: async () => [],
        start: () => { throw new Error('/Users/private/provider diagnostic=secret') },
        cancel: () => false,
      } as never,
      isAllowedOrigin: () => true,
    })
    const sender = { isDestroyed: () => false }
    const frame = { url: 'http://127.0.0.1:43123' }
    const start = handlers.get(IPC_CHANNELS.startDesktopAgentRun)!

    expect(() => start({ sender: { ...sender, mainFrame: frame }, senderFrame: frame }, {
      providerId: 'agy',
      prompt: 'safe request',
    })).toThrow('데스크톱 에이전트 요청을 처리하지 못했습니다.')
  })
})
