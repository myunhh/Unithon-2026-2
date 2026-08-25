export type HealthPolicyDecision = 'allowed' | 'denied'

export interface HealthPolicy {
  readonly evaluate: () => Promise<HealthPolicyDecision>
}

export class HealthPolicyDeniedError extends Error {
  readonly name = 'HealthPolicyDeniedError'

  constructor() {
    super('health policy denied')
  }
}
