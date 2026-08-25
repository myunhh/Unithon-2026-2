import { contextBridge, ipcRenderer } from 'electron'
import { createDesktopBridge } from './preload-bridge.js'

const desktopBridge = createDesktopBridge(ipcRenderer)

contextBridge.exposeInMainWorld('paperbridgeDesktop', desktopBridge)
