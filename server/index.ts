import { createApiServer } from './app.js'
import { loadServerEnv } from './env.js'

const environment = loadServerEnv()
const server = createApiServer(environment)

server.listen(environment.port, '127.0.0.1', () => {
  console.info(`PaperBridge API listening on http://127.0.0.1:${environment.port}`)
})

function stopServer() {
  server.close(() => process.exit(0))
}

process.once('SIGINT', stopServer)
process.once('SIGTERM', stopServer)
