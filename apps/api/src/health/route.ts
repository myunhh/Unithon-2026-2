import { Hono } from 'hono'

import type { HealthService } from './service.js'

export function createHealthRoute(service: HealthService): Hono {
  const app = new Hono()

  app.get('/health', async (context) => {
    const health = await service.getHealth()
    return context.json(health)
  })

  return app
}
