import type { NormalizedAgentEvent } from './agent-runtime/contracts.js'

export const IPC_CHANNELS = {
  getAppInfo: 'paperbridge:get-app-info',
  openExternal: 'paperbridge:open-external',
  getDesktopProviderHealth: 'paperbridge:get-desktop-provider-health',
  startDesktopAgentRun: 'paperbridge:start-desktop-agent-run',
  cancelDesktopAgentRun: 'paperbridge:cancel-desktop-agent-run',
  desktopAgentRunEvent: 'paperbridge:desktop-agent-run-event',
} as const

export type DesktopAppInfo = {
  platform: string
  version: string
}

export type DesktopProviderId = 'claude-code' | 'codex' | 'agy'

export type DesktopProviderHealth = {
  providerId: DesktopProviderId
  status: 'healthy' | 'limited' | 'failed'
  detected: boolean
  authenticated: boolean
  checkedAt: string
  message: string
}

export type GetDesktopProviderHealthOptions = {
  refresh?: boolean
}

export type DesktopAgentRunRequest = {
  providerId: DesktopProviderId
  prompt: string
  model?: string
  effort?: 'low' | 'medium' | 'high'
  agent?: string
  conversationId?: string
  printTimeout?: string
  timeoutMs?: number
}

export type DesktopAgentRunAccepted = {
  runId: string
}

export type CancelDesktopAgentRunResult = {
  cancelled: boolean
}

export type DesktopAgentEvent = NormalizedAgentEvent
export type DesktopAgentEventListener = (event: DesktopAgentEvent) => void

export type PaperBridgeDesktop = {
  getAppInfo: () => Promise<DesktopAppInfo>
  openExternal: (url: string) => Promise<void>
  getDesktopProviderHealth: (options?: GetDesktopProviderHealthOptions) => Promise<readonly DesktopProviderHealth[]>
  startDesktopAgentRun: (request: DesktopAgentRunRequest) => Promise<DesktopAgentRunAccepted>
  cancelDesktopAgentRun: (runId: string) => Promise<CancelDesktopAgentRunResult>
  subscribeDesktopAgentRun: (listener: DesktopAgentEventListener) => void
  unsubscribeDesktopAgentRun: (listener: DesktopAgentEventListener) => void
}
