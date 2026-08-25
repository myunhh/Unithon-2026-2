import {
  HealthPolicyDeniedError,
  type HealthPolicy,
} from './policy.js'
import type { HealthRepository } from './repository.js'
import type { HealthResponse } from './types.js'

export type HealthServiceDependencies = Readonly<{
  readonly policy: HealthPolicy
  readonly repository: HealthRepository
}>

export interface HealthService {
  readonly getHealth: () => Promise<HealthResponse>
}

class UnexpectedHealthPolicyDecisionError extends Error {
  readonly name = 'UnexpectedHealthPolicyDecisionError'

  constructor(readonly decision: never) {
    super('unexpected health policy decision')
  }
}

function assertNever(value: never): never {
  throw new UnexpectedHealthPolicyDecisionError(value)
}

export function createHealthService(
  dependencies: HealthServiceDependencies,
): HealthService {
  return {
    getHealth: async () => {
      const decision = await dependencies.policy.evaluate()

      switch (decision) {
        case 'allowed':
          return dependencies.repository.read()
        case 'denied':
          throw new HealthPolicyDeniedError()
        default:
          return assertNever(decision)
      }
    },
  }
}
