import type { HealthResponse } from './types.js'

export interface HealthRepository {
  readonly read: () => Promise<HealthResponse>
}
