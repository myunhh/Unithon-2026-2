export const DEVICE_SESSION_DEMO_IDS = {
  current: 'demo-current-device',
  laptop: 'demo-laptop-device',
  studio: 'demo-studio-device',
} as const

export type DeviceSessionDemoId = (typeof DEVICE_SESSION_DEMO_IDS)[keyof typeof DEVICE_SESSION_DEMO_IDS]
export type DeviceSessionDemoStatus = 'active' | 'revoked'

export type DeviceSessionDemoRow = {
  readonly id: DeviceSessionDemoId
  readonly deviceName: string
  readonly deviceDetail: string
  readonly appVersion: string
  readonly lastActive: string
  readonly createdAt: string
  readonly isCurrent: boolean
  readonly status: DeviceSessionDemoStatus
}

export const DEVICE_SESSION_DEMO_ROWS = [
  {
    id: DEVICE_SESSION_DEMO_IDS.current,
    deviceName: '이 MacBook',
    deviceDetail: 'macOS · Apple Silicon',
    appVersion: 'Desktop 0.8.0',
    lastActive: '지금 사용 중',
    createdAt: '오늘 등록',
    isCurrent: true,
    status: 'active',
  },
  {
    id: DEVICE_SESSION_DEMO_IDS.laptop,
    deviceName: '개인 MacBook Air',
    deviceDetail: 'macOS · Apple Silicon',
    appVersion: 'Desktop 0.7.4',
    lastActive: '어제, 21:18',
    createdAt: '2026년 8월 19일 등록',
    isCurrent: false,
    status: 'active',
  },
  {
    id: DEVICE_SESSION_DEMO_IDS.studio,
    deviceName: '연구실 iMac',
    deviceDetail: 'macOS · Intel',
    appVersion: 'Desktop 0.7.2',
    lastActive: '2026년 8월 22일',
    createdAt: '2026년 7월 30일 등록',
    isCurrent: false,
    status: 'active',
  },
] as const satisfies readonly DeviceSessionDemoRow[]

export type DeviceSessionDemoState = {
  readonly sessions: readonly DeviceSessionDemoRow[]
  readonly pendingId: DeviceSessionDemoId | null
  readonly notice: string | null
}

export type DeviceSessionDemoAction =
  | { readonly kind: 'request-revoke'; readonly id: DeviceSessionDemoId }
  | { readonly kind: 'cancel-revoke' }
  | { readonly kind: 'confirm-revoke' }

export type DialogFocusEvent = Readonly<{
  readonly key: string
  readonly shiftKey: boolean
  readonly preventDefault: () => void
}>

export type DialogFocusTarget = Readonly<{ focus: () => void }>

export function cycleDialogFocus(
  event: DialogFocusEvent,
  activeElement: unknown,
  targets: readonly DialogFocusTarget[],
): boolean {
  if (event.key !== 'Tab' || targets.length === 0) return false
  const first = targets[0]
  const last = targets[targets.length - 1]
  if (!event.shiftKey && activeElement === last) {
    event.preventDefault()
    first.focus()
    return true
  }
  if (event.shiftKey && activeElement === first) {
    event.preventDefault()
    last.focus()
    return true
  }
  return false
}

function assertNever(value: never): never {
  throw new Error(`Unhandled device-session demo action: ${JSON.stringify(value)}`)
}

function markRevoked(
  sessions: readonly DeviceSessionDemoRow[],
  id: DeviceSessionDemoId,
): readonly DeviceSessionDemoRow[] {
  return sessions.map((session) => session.id === id ? { ...session, status: 'revoked' as const } : session)
}

export function createDeviceSessionDemoState(): DeviceSessionDemoState {
  return { sessions: DEVICE_SESSION_DEMO_ROWS, pendingId: null, notice: null }
}

export function reduceDeviceSessionDemo(
  state: DeviceSessionDemoState,
  action: DeviceSessionDemoAction,
): DeviceSessionDemoState {
  switch (action.kind) {
    case 'request-revoke': {
      const selected = state.sessions.find((session) => session.id === action.id)
      if (!selected || selected.isCurrent || selected.status === 'revoked') return state
      return { ...state, pendingId: action.id, notice: null }
    }
    case 'cancel-revoke':
      return { ...state, pendingId: null }
    case 'confirm-revoke': {
      if (!state.pendingId) return state
      const selected = state.sessions.find((session) => session.id === state.pendingId)
      if (!selected || selected.isCurrent || selected.status === 'revoked') return { ...state, pendingId: null }
      return {
        sessions: markRevoked(state.sessions, selected.id),
        pendingId: null,
        notice: `${selected.deviceName} 연결을 데모 상태에서 해제했습니다.`,
      }
    }
    default:
      return assertNever(action)
  }
}
