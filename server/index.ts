import { createApiServer } from './app.js'
import { loadServerEnv } from './env.js'

function startServer() {
  let environment: ReturnType<typeof loadServerEnv>
  try {
    environment = loadServerEnv()
  } catch {
    console.error('PaperBridge API configuration is invalid.')
    process.exitCode = 1
    return
  }

  const server = createApiServer(environment)

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
