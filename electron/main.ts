import { app, BrowserWindow, ipcMain, shell } from 'electron'
import type { Server } from 'node:http'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApiServer } from '../server/app.js'
import { loadServerEnv } from '../server/env.js'
import { IPC_CHANNELS } from './ipc.js'
import { AgyProvider, ClaudeCodeProvider, CodexProvider } from './agent-runtime/index.js'
import { registerDesktopAgentIpc } from './desktop-agent-ipc.js'
import { DesktopAgentService } from './desktop-agent-service.js'
import { prepareDesktopAgentWorkspace } from './desktop-agent-workspace.js'
import { providerEncryptionKeyForInstallation } from './provider-encryption-key.js'
import { sessionSecretForInstallation as persistedSessionSecretForInstallation } from './installation-session-secret.js'
import { openExternalSafely } from './safe-external.js'

const currentFile = fileURLToPath(import.meta.url)
const currentDirectory = dirname(currentFile)
const developmentServerUrl = process.env.VITE_DEV_SERVER_URL

let desktopServer: Server | undefined
let desktopOrigin: string | undefined
let rendererOrigin: string | undefined
let desktopAgentService: DesktopAgentService | undefined
let quitting = false

function isAllowedExternalUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && Boolean(url.hostname) && !url.username && !url.password
  } catch {
    return false
  }
}

function isPaperBridgeUrl(value: string): boolean {
  try {
    return Boolean(rendererOrigin) && new URL(value).origin === rendererOrigin
  } catch {
    return false
  }
}

function isTrustedIpcSender(event: Electron.IpcMainInvokeEvent): boolean {
  return !event.sender.isDestroyed() && event.senderFrame === event.sender.mainFrame && isPaperBridgeUrl(event.senderFrame.url)
}

async function sessionSecretForInstallation(): Promise<string> {
  const supplied = process.env.PAPERBRIDGE_SESSION_SECRET?.trim()
  if (supplied) return supplied
  return persistedSessionSecretForInstallation(app.getPath('userData'))
}

async function providerEncryptionKeyForDesktopServer(): Promise<string | undefined> {
  if (app.isPackaged) return providerEncryptionKeyForInstallation(app.getPath('userData'))
  return process.env.PAPERBRIDGE_ENCRYPTION_KEY?.trim() || undefined
}

async function startPackagedServer(): Promise<string> {
  if (desktopOrigin) return desktopOrigin

  const sessionSecret = await sessionSecretForInstallation()
  const providerEncryptionKey = await providerEncryptionKeyForDesktopServer()
  // Port 0 is replaced with the assigned loopback port before the BrowserWindow
  // can issue a request. The renderer only ever sees the resulting same origin.
  const environment = loadServerEnv({
    ...process.env,
    APP_ORIGIN: 'http://127.0.0.1:0',
    NODE_ENV: 'production',
    PAPERBRIDGE_SESSION_SECRET: sessionSecret,
    ...(providerEncryptionKey ? { PAPERBRIDGE_ENCRYPTION_KEY: providerEncryptionKey } : {}),
  })
  const server = createApiServer(environment, { staticRoot: join(currentDirectory, '../../dist') })
  await new Promise<void>((resolveListen, rejectListen) => {
    const onError = (error: Error) => {
      server.removeListener('listening', onListening)
      rejectListen(error)
    }
    const onListening = () => {
      server.removeListener('error', onError)
      resolveListen()
    }
    server.once('error', onError)
    server.once('listening', onListening)
    server.listen(0, '127.0.0.1')
  })

  const address = server.address()
  if (!address || typeof address === 'string') {
    server.close()
    throw new Error('PaperBridge could not determine its loopback server address.')
  }

  desktopOrigin = `http://127.0.0.1:${address.port}`
  environment.appOrigin = desktopOrigin
  desktopServer = server
  return desktopOrigin
}

async function stopPackagedServer(): Promise<void> {
  if (!desktopServer) return
  const server = desktopServer
  desktopServer = undefined
  desktopOrigin = undefined
  await new Promise<void>((resolveStop) => server.close(() => resolveStop()))
}

function createMainWindow(origin: string) {
  const window = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#f5f6f8',
    show: false,
    webPreferences: {
      preload: join(currentDirectory, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  })

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) openExternalSafely((value) => shell.openExternal(value), url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    desktopAgentService?.cancelOwner(window.webContents.id)
    if (isPaperBridgeUrl(url)) return
    event.preventDefault()
    if (isAllowedExternalUrl(url)) openExternalSafely((value) => shell.openExternal(value), url)
  })
  window.webContents.on('will-attach-webview', (event) => event.preventDefault())
  window.webContents.once('destroyed', () => desktopAgentService?.cancelOwner(window.webContents.id))
  window.once('ready-to-show', () => window.show())

  void window.loadURL(`${origin}/library`)
}

ipcMain.handle(IPC_CHANNELS.getAppInfo, (event) => {
  if (!isTrustedIpcSender(event)) throw new Error('허용되지 않은 창에서 데스크톱 요청을 보냈습니다.')
  return { platform: process.platform, version: app.getVersion() }
})
ipcMain.handle(IPC_CHANNELS.openExternal, async (event, url: unknown) => {
  if (!isTrustedIpcSender(event)) throw new Error('허용되지 않은 창에서 데스크톱 요청을 보냈습니다.')
  if (typeof url !== 'string' || !isAllowedExternalUrl(url)) {
    throw new Error('안전한 HTTPS 링크만 열 수 있습니다.')
  }
  await shell.openExternal(url)
})

async function initializeDesktopAgentService(): Promise<void> {
  const workspaceRoot = await prepareDesktopAgentWorkspace(app.getPath('userData'))
  desktopAgentService = new DesktopAgentService({
    workspaceRoot,
    providers: [
      new ClaudeCodeProvider({ workspaceRoot }),
      new CodexProvider({ workspaceRoot }),
      new AgyProvider({ workspaceRoot }),
    ],
    eventChannel: IPC_CHANNELS.desktopAgentRunEvent,
  })
  registerDesktopAgentIpc({
    ipcMain,
    service: desktopAgentService,
    isAllowedOrigin: isPaperBridgeUrl,
  })
  void desktopAgentService.getProviderHealth(true).catch(() => undefined)
}

app.whenReady().then(async () => {
  const origin = developmentServerUrl ?? await startPackagedServer()
  rendererOrigin = origin
  await initializeDesktopAgentService()
  createMainWindow(origin)
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0 && rendererOrigin) createMainWindow(rendererOrigin)
  })
}).catch((error: unknown) => {
  console.error('PaperBridge could not start.', error)
  app.exit(1)
})

app.on('before-quit', (event) => {
  if (quitting) return
  quitting = true
  event.preventDefault()
  void (async () => {
    await desktopAgentService?.shutdown()
    await stopPackagedServer()
  })().catch(() => undefined).finally(() => app.exit(0))
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
