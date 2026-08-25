import { describe, expect, it } from 'vitest'
import {
  DEVICE_SESSION_DEMO_IDS,
  cycleDialogFocus,
  createDeviceSessionDemoState,
  reduceDeviceSessionDemo,
} from './device-session-demo'

describe('device-session demo reducer', () => {
  it('opens confirmation without changing a session', () => {
    const initial = createDeviceSessionDemoState()

    const pending = reduceDeviceSessionDemo(initial, {
      kind: 'request-revoke',
      id: DEVICE_SESSION_DEMO_IDS.laptop,
    })

    expect(pending.pendingId).toBe(DEVICE_SESSION_DEMO_IDS.laptop)
    expect(pending.sessions.find((session) => session.id === DEVICE_SESSION_DEMO_IDS.laptop)?.status).toBe('active')
  })

  it('cancels confirmation without changing a session', () => {
    const pending = reduceDeviceSessionDemo(createDeviceSessionDemoState(), {
      kind: 'request-revoke',
      id: DEVICE_SESSION_DEMO_IDS.laptop,
    })

    const cancelled = reduceDeviceSessionDemo(pending, { kind: 'cancel-revoke' })

    expect(cancelled.pendingId).toBeNull()
    expect(cancelled.sessions.find((session) => session.id === DEVICE_SESSION_DEMO_IDS.laptop)?.status).toBe('active')
  })

  it('marks the confirmed non-current device as revoked in demo state', () => {
    const pending = reduceDeviceSessionDemo(createDeviceSessionDemoState(), {
      kind: 'request-revoke',
      id: DEVICE_SESSION_DEMO_IDS.laptop,
    })

    const revoked = reduceDeviceSessionDemo(pending, { kind: 'confirm-revoke' })

    expect(revoked.pendingId).toBeNull()
    expect(revoked.sessions.find((session) => session.id === DEVICE_SESSION_DEMO_IDS.laptop)?.status).toBe('revoked')
    expect(revoked.notice).toContain('데모 상태')
  })

  it('does not open confirmation for the current device', () => {
    const initial = createDeviceSessionDemoState()

    const next = reduceDeviceSessionDemo(initial, {
      kind: 'request-revoke',
      id: DEVICE_SESSION_DEMO_IDS.current,
    })

    expect(next).toEqual(initial)
  })

  it('cycles Tab from the last modal control to the first', () => {
    const focused: string[] = []
    const targets = [
      { focus: () => focused.push('cancel') },
      { focus: () => focused.push('confirm') },
    ]
    let prevented = false

    const handled = cycleDialogFocus({
      key: 'Tab',
      shiftKey: false,
      preventDefault: () => { prevented = true },
    }, targets[1], targets)

    expect(handled).toBe(true)
    expect(prevented).toBe(true)
    expect(focused).toEqual(['cancel'])
  })

  it('cycles Shift+Tab from the first modal control to the last', () => {
    const focused: string[] = []
    const targets = [
      { focus: () => focused.push('cancel') },
      { focus: () => focused.push('confirm') },
    ]
    let prevented = false

    const handled = cycleDialogFocus({
      key: 'Tab',
      shiftKey: true,
      preventDefault: () => { prevented = true },
    }, targets[0], targets)

    expect(handled).toBe(true)
    expect(prevented).toBe(true)
    expect(focused).toEqual(['confirm'])
  })
})
