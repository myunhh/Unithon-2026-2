import { Hono } from 'hono'

import { createHealthRoute } from './health/route.js'
import {
  createHealthService,
  type HealthServiceDependencies,
} from './health/service.js'

export type ApiDependencies = Readonly<{
  readonly health: HealthServiceDependencies
}>

export const packageSurface = {
  name: '@paperbridge/api',
  entrypoint: 'api',
} as const

export function createApiApp(dependencies: ApiDependencies): Hono {
  const healthService = createHealthService(dependencies.health)
  const app = new Hono()

  app.route('/v1', createHealthRoute(healthService))

  return app
}

export { HealthPolicyDeniedError } from './health/policy.js'
export { createHealthService } from './health/service.js'
