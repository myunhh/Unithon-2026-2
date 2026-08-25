import { describe, expect, it } from 'vitest'
import { routeFromPath } from './useAppRoute'

describe('application routes', () => {
  it('keeps public, account, and existing workspace routes distinct', () => {
    expect(routeFromPath('/')).toEqual({ name: 'landing' })
    expect(routeFromPath('/login')).toEqual({ name: 'login' })
    expect(routeFromPath('/account')).toEqual({ name: 'account' })
    expect(routeFromPath('/library')).toEqual({ name: 'library' })
    expect(routeFromPath('/reader/a%20paper')).toEqual({ name: 'reader', documentId: 'a paper' })
    expect(routeFromPath('/settings')).toEqual({ name: 'settings' })
  })
})
