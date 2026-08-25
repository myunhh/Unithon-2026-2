import { describe, expect, it } from 'vitest'
import {
  availableDemoProviders,
  DEMO_PROVIDER_FIXTURE,
  findDemoProvider,
} from './providerFixtures'

describe('provider settings demo fixture', () => {
  it('exposes public statuses only and keeps the four provider cards stable', () => {
    expect(DEMO_PROVIDER_FIXTURE.map((provider) => provider.id)).toEqual(['openrouter', 'claude-code', 'codex', 'agy'])
    expect(availableDemoProviders(DEMO_PROVIDER_FIXTURE).map((provider) => provider.id)).toEqual(['openrouter', 'claude-code'])
    expect(JSON.stringify(DEMO_PROVIDER_FIXTURE)).not.toMatch(/api.?key|secret|token|credential/i)
  })

  it('finds a provider by its typed demo id', () => {
    expect(findDemoProvider('codex', DEMO_PROVIDER_FIXTURE)?.status).toBe('reconnect_required')
    expect(findDemoProvider('agy', DEMO_PROVIDER_FIXTURE)?.publicValue).toBe('확인 기록 없음')
  })
})
