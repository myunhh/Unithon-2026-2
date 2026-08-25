import type { IpcMainInvokeEvent, WebContents } from 'electron'
import { IPC_CHANNELS, type DesktopAgentRunRequest, type GetDesktopProviderHealthOptions } from './ipc.js'
import { DesktopAgentService, type DesktopAgentOwner, type DesktopAgentStart } from './desktop-agent-service.js'

type IpcHandler = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown

export type DesktopIpcRegistrar = {
  handle(channel: string, listener: IpcHandler): void
}

export type DesktopAgentIpcOptions = {
  ipcMain: DesktopIpcRegistrar
  service: DesktopAgentService
  isAllowedOrigin: (url: string) => boolean
}

const providerIds = new Set(['claude-code', 'codex', 'agy'])
const effortLevels = new Set(['low', 'medium', 'high'])
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const safeOptionValue = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/
const maxPromptCharacters = 16_000
const maxPromptBytes = 64 * 1024
const maxTimeoutMs = 15 * 60_000
const minTimeoutMs = 1_000
const publicIpcFailureMessage = '데스크톱 에이전트 요청을 처리하지 못했습니다.'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key))
}

function stringOption(value: unknown): string | undefined {
  return typeof value === 'string' && safeOptionValue.test(value) ? value : undefined
}

function durationMilliseconds(value: string): number | undefined {
  const match = /^([1-9]\d{0,5})(ms|s|m|h)$/.exec(value)
  if (!match) return undefined
  const amount = Number(match[1])
  const multiplier = match[2] === 'ms' ? 1 : match[2] === 's' ? 1_000 : match[2] === 'm' ? 60_000 : 3_600_000
  const milliseconds = amount * multiplier
  return Number.isSafeInteger(milliseconds) && milliseconds >= minTimeoutMs && milliseconds <= maxTimeoutMs
    ? milliseconds
    : undefined
}

function invalidRequest(): never {
  throw new Error('데스크톱 에이전트 요청 형식이 올바르지 않습니다.')
}

export function parseDesktopAgentRunRequest(value: unknown): DesktopAgentStart {
  if (!isRecord(value) || !hasOnlyKeys(value, ['providerId', 'prompt', 'model', 'effort', 'agent', 'conversationId', 'printTimeout', 'timeoutMs'])) {
    return invalidRequest()
  }
  if (typeof value.providerId !== 'string' || !providerIds.has(value.providerId)) return invalidRequest()
  if (
    typeof value.prompt !== 'string' ||
    value.prompt.length === 0 ||
    value.prompt.length > maxPromptCharacters ||
    Buffer.byteLength(value.prompt, 'utf8') > maxPromptBytes ||
    value.prompt.includes('\0')
  ) return invalidRequest()

  const model = value.model === undefined ? undefined : stringOption(value.model)
  const agent = value.agent === undefined ? undefined : stringOption(value.agent)
  if ((value.model !== undefined && !model) || (value.agent !== undefined && !agent)) return invalidRequest()
  if (value.effort !== undefined && (typeof value.effort !== 'string' || !effortLevels.has(value.effort))) return invalidRequest()
  if (value.conversationId !== undefined && (typeof value.conversationId !== 'string' || !uuidPattern.test(value.conversationId))) return invalidRequest()

  const printTimeout = value.printTimeout === undefined ? undefined : typeof value.printTimeout === 'string' ? value.printTimeout : undefined
  if ((value.printTimeout !== undefined && !printTimeout) || (printTimeout && durationMilliseconds(printTimeout) === undefined)) return invalidRequest()
  if (
    value.timeoutMs !== undefined &&
    (typeof value.timeoutMs !== 'number' || !Number.isSafeInteger(value.timeoutMs) || value.timeoutMs < minTimeoutMs || value.timeoutMs > maxTimeoutMs)
  ) return invalidRequest()
  if (printTimeout && value.timeoutMs !== undefined && durationMilliseconds(printTimeout)! > value.timeoutMs) return invalidRequest()

  return {
    providerId: value.providerId as DesktopAgentRunRequest['providerId'],
    prompt: value.prompt,
    ...(model ? { model } : {}),
    ...(value.effort ? { effort: value.effort as DesktopAgentRunRequest['effort'] } : {}),
    ...(agent ? { agent } : {}),
    ...(value.conversationId ? { conversationId: value.conversationId } : {}),
    ...(printTimeout ? { printTimeout } : {}),
    ...(value.timeoutMs !== undefined ? { timeoutMs: value.timeoutMs } : {}),
  }
}

export function parseGetDesktopProviderHealthOptions(value: unknown): GetDesktopProviderHealthOptions {
  if (value === undefined) return {}
  if (!isRecord(value) || !hasOnlyKeys(value, ['refresh']) || (value.refresh !== undefined && typeof value.refresh !== 'boolean')) {
    throw new Error('에이전트 상태 요청 형식이 올바르지 않습니다.')
  }
  return value.refresh ? { refresh: true } : {}
}

export function parseDesktopAgentRunId(value: unknown): string {
  if (typeof value !== 'string' || !uuidPattern.test(value)) throw new Error('데스크톱 에이전트 실행 식별자가 올바르지 않습니다.')
  return value
}

function ownerFrom(webContents: WebContents): DesktopAgentOwner {
  return webContents
}

function assertTrustedMainFrame(event: IpcMainInvokeEvent, isAllowedOrigin: (url: string) => boolean): void {
  if (event.sender.isDestroyed() || event.senderFrame !== event.sender.mainFrame || !isAllowedOrigin(event.senderFrame.url)) {
    throw new Error('허용되지 않은 창에서 데스크톱 요청을 보냈습니다.')
  }
}

function invokeRendererSafely<T>(operation: () => T | Promise<T>): T | Promise<T> {
  try {
    const result = operation()
    if (result && typeof (result as PromiseLike<T>).then === 'function') {
      return Promise.resolve(result).catch(() => {
        throw new Error(publicIpcFailureMessage)
      })
    }
    return result
  } catch {
    throw new Error(publicIpcFailureMessage)
  }
}

/** Register the only renderer-to-desktop-agent capability surface. */
export function registerDesktopAgentIpc(options: DesktopAgentIpcOptions): void {
  options.ipcMain.handle(IPC_CHANNELS.getDesktopProviderHealth, (event, rawOptions: unknown) => {
    assertTrustedMainFrame(event, options.isAllowedOrigin)
    const parsed = parseGetDesktopProviderHealthOptions(rawOptions)
    return invokeRendererSafely(() => options.service.getProviderHealth(parsed.refresh === true))
  })
  options.ipcMain.handle(IPC_CHANNELS.startDesktopAgentRun, (event, rawRequest: unknown) => {
    assertTrustedMainFrame(event, options.isAllowedOrigin)
    const request = parseDesktopAgentRunRequest(rawRequest)
    return invokeRendererSafely(() => ({ runId: options.service.start(ownerFrom(event.sender), request) }))
  })
  options.ipcMain.handle(IPC_CHANNELS.cancelDesktopAgentRun, (event, rawRunId: unknown) => {
    assertTrustedMainFrame(event, options.isAllowedOrigin)
    const runId = parseDesktopAgentRunId(rawRunId)
    return invokeRendererSafely(() => ({ cancelled: options.service.cancel(ownerFrom(event.sender), runId) }))
  })
}
