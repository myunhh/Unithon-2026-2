import { randomBytes } from 'node:crypto'
import { createApiServer, type ApiServerOptions } from './app.js'
import { createDevelopmentAuthService } from './auth.js'
import { InMemoryDocumentStore } from './documents.js'
import { loadServerEnv } from './env.js'
import { createInMemoryHighlightStoreFactory } from './highlights.js'
import { createInMemoryProviderRepositoryFactory } from './provider-state.js'

function developmentEnvironment(): NodeJS.ProcessEnv {
  if (process.env.NODE_ENV === 'production') return process.env
  const origins = [...new Set([
    process.env.APP_ORIGIN,
    'http://127.0.0.1:5173',
    'http://localhost:5173',
  ].filter((origin): origin is string => Boolean(origin)))].join(',')
  return {
    ...process.env,
    APP_ORIGINS: process.env.APP_ORIGINS ?? origins,
    PAPERBRIDGE_SESSION_SECRET: process.env.PAPERBRIDGE_SESSION_SECRET ?? randomBytes(32).toString('base64url'),
    PAPERBRIDGE_ENCRYPTION_KEY_V1: process.env.PAPERBRIDGE_ENCRYPTION_KEY_V1
      ?? process.env.PAPERBRIDGE_ENCRYPTION_KEY
      ?? `base64url:${randomBytes(32).toString('base64url')}`,
  }
}

function developmentOptions(environment: ReturnType<typeof loadServerEnv>): ApiServerOptions {
  if (environment.nodeEnv === 'production' || environment.supabase) return {}
  const documentStores = new Map<string, InMemoryDocumentStore>()
  return {
    documentStoreForSession: (sessionId) => {
      const existing = documentStores.get(sessionId)
      if (existing) return existing
      const store = new InMemoryDocumentStore(environment.maxPdfBytes)
      documentStores.set(sessionId, store)
      return store
    },
    highlightStoreForSession: createInMemoryHighlightStoreFactory(),
    providerRepositoryForSession: createInMemoryProviderRepositoryFactory(environment),
    authService: createDevelopmentAuthService(),
  }
}

function startServer() {
  let environment: ReturnType<typeof loadServerEnv>
  try {
    environment = loadServerEnv(developmentEnvironment())
  } catch {
    console.error('PaperBridge API configuration is invalid.')
    process.exitCode = 1
    return
  }

  const server = createApiServer(environment, developmentOptions(environment))

  server.listen(environment.port, '127.0.0.1', () => {
    console.info(`PaperBridge API listening on http://127.0.0.1:${environment.port}`)
  })

  function stopServer() {
    server.close(() => process.exit(0))
  }

  process.once('SIGINT', stopServer)
  process.once('SIGTERM', stopServer)
}

startServer()
