import { describe, expect, it } from 'vitest'
import { PdfLoadLifecycle } from './reader'

describe('PdfLoadLifecycle', () => {
  it('destroys an attached task when the Reader is disposed', async () => {
    let destroyed = 0
    const lifecycle = new PdfLoadLifecycle()
    expect(lifecycle.attach({ destroy: async () => { destroyed += 1 } })).toBe(true)

    lifecycle.dispose()
    await Promise.resolve()

    expect(lifecycle.isActive).toBe(false)
    expect(destroyed).toBe(1)
  })

  it('destroys a task that arrives after disposal instead of leaking it', async () => {
    let destroyed = 0
    const lifecycle = new PdfLoadLifecycle()
    lifecycle.dispose()

    expect(lifecycle.attach({ destroy: async () => { destroyed += 1 } })).toBe(false)
    await Promise.resolve()

    expect(destroyed).toBe(1)
  })
})
