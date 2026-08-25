import { describe, expect, it } from 'vitest'

import {
  createApiApp,
  createHealthService,
  HealthPolicyDeniedError,
} from './main.js'

const healthFixture = {
  name: 'PaperBridge API',
  status: 'ok',
  buildSha: 'test-build-sha',
  contractVersion: '1.0.0-draft.1',
  dependencies: {
    database: 'ok',
  },
} as const

describe('health HTTP boundary', () => {
  it('returns the contract health shape from the injected seams', async () => {
    const events: string[] = []
    const policy = {
      evaluate: async () => {
        events.push('policy')
        return 'allowed' as const
      },
    }
    const repository = {
      read: async () => {
        events.push('repository')
        return healthFixture
      },
    }
    const app = createApiApp({ health: { policy, repository } })

    const response = await app.request('http://api.test/v1/health')

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(healthFixture)
    expect(events).toEqual(['policy', 'repository'])
  })
})

describe('health service orchestration', () => {
  it('evaluates policy before reading the repository', async () => {
    const events: string[] = []
    const service = createHealthService({
      policy: {
        evaluate: async () => {
          events.push('policy')
          return 'allowed' as const
        },
      },
      repository: {
        read: async () => {
          events.push('repository')
          return healthFixture
        },
      },
    })

    const result = await service.getHealth()

    expect(result).toEqual(healthFixture)
    expect(events).toEqual(['policy', 'repository'])
  })

  it('stops before the repository when policy denies health access', async () => {
    const events: string[] = []
    const service = createHealthService({
      policy: {
        evaluate: async () => {
          events.push('policy')
          return 'denied' as const
        },
      },
      repository: {
        read: async () => {
          events.push('repository')
          return healthFixture
        },
      },
    })

    const result = service.getHealth()

    await expect(result).rejects.toBeInstanceOf(HealthPolicyDeniedError)
    expect(events).toEqual(['policy'])
  })
})
