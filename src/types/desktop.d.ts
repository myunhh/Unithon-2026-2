import type { PaperBridgeDesktop } from '../../electron/ipc'

declare global {
  interface Window {
    paperbridgeDesktop?: PaperBridgeDesktop
  }
}

export {}
