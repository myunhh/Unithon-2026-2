import { describe, expect, it } from 'vitest'
import { openExternalSafely } from './safe-external.js'

describe('openExternalSafely', () => {
  it('consumes a detached OS integration rejection', async () => {
    let unhandled = false
    const onUnhandled = () => { unhandled = true }
    process.once('unhandledRejection', onUnhandled)
    openExternalSafely(async () => { throw new Error('OS association is unavailable') }, 'https://example.com')
    await new Promise((resolve) => setTimeout(resolve, 0))
    process.removeListener('unhandledRejection', onUnhandled)
    expect(unhandled).toBe(false)
  })
})
