import {
  IPC_CHANNELS,
  type DesktopAgentEventListener,
  type PaperBridgeDesktop,
} from './ipc.js'
import { isDesktopAgentEvent } from './preload-events.js'

export type DesktopIpcRenderer = {
  invoke(channel: string, ...arguments_: readonly unknown[]): Promise<unknown>
  on(channel: string, listener: (event: unknown, payload: unknown) => void): void
  removeListener(channel: string, listener: (event: unknown, payload: unknown) => void): void
}

/** Creates the narrow renderer bridge while keeping listener identities removable. */
export function createDesktopBridge(ipcRenderer: DesktopIpcRenderer): PaperBridgeDesktop {
  const agentEventListeners = new Map<DesktopAgentEventListener, (event: unknown, payload: unknown) => void>()
  return {
    getAppInfo: () => ipcRenderer.invoke(IPC_CHANNELS.getAppInfo) as ReturnType<PaperBridgeDesktop['getAppInfo']>,
    openExternal: (url) => ipcRenderer.invoke(IPC_CHANNELS.openExternal, url) as ReturnType<PaperBridgeDesktop['openExternal']>,
    getDesktopProviderHealth: (options) => ipcRenderer.invoke(
      IPC_CHANNELS.getDesktopProviderHealth,
      options,
    ) as ReturnType<PaperBridgeDesktop['getDesktopProviderHealth']>,
    startDesktopAgentRun: (request) => ipcRenderer.invoke(
      IPC_CHANNELS.startDesktopAgentRun,
      request,
    ) as ReturnType<PaperBridgeDesktop['startDesktopAgentRun']>,
    cancelDesktopAgentRun: (runId) => ipcRenderer.invoke(
      IPC_CHANNELS.cancelDesktopAgentRun,
      runId,
    ) as ReturnType<PaperBridgeDesktop['cancelDesktopAgentRun']>,
    subscribeDesktopAgentRun: (listener) => {
      if (agentEventListeners.has(listener)) return
      const wrapped = (_event: unknown, payload: unknown) => {
        if (isDesktopAgentEvent(payload)) listener(payload)
      }
      agentEventListeners.set(listener, wrapped)
      ipcRenderer.on(IPC_CHANNELS.desktopAgentRunEvent, wrapped)
    },
    unsubscribeDesktopAgentRun: (listener) => {
      const wrapped = agentEventListeners.get(listener)
      if (!wrapped) return
      agentEventListeners.delete(listener)
      ipcRenderer.removeListener(IPC_CHANNELS.desktopAgentRunEvent, wrapped)
    },
  }
}
