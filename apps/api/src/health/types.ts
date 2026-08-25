export const HEALTH_NAME = 'PaperBridge API' as const

export type HealthStatus = 'ok' | 'degraded'

export type HealthDependencyStatus = 'ok' | 'degraded' | 'unavailable'

export type HealthResponse = Readonly<{
  readonly name: typeof HEALTH_NAME
  readonly status: HealthStatus
  readonly buildSha: string
  readonly contractVersion: string
  readonly dependencies?: Readonly<Record<string, HealthDependencyStatus>>
}>
