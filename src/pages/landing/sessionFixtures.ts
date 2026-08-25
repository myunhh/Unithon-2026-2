export const SESSION_DEMO_STATES = ['loading', 'anonymous', 'authenticated', 'error'] as const

export type SessionDemoState = (typeof SESSION_DEMO_STATES)[number]

export type SessionDemoAction =
  | { readonly type: 'select'; readonly state: SessionDemoState }
  | { readonly type: 'retry' }
  | { readonly type: 'logout' }

export type SessionDemoProfile = Readonly<{
  email: string
  createdAt: string
  lastSignInAt: string
}>

export const SESSION_DEMO_PROFILE: SessionDemoProfile = {
  email: 'demo.user@example.invalid',
  createdAt: '데모 계정 · 날짜 없음',
  lastSignInAt: '데모 계정 · 날짜 없음',
}

export function transitionSessionDemo(
  current: SessionDemoState,
  action: SessionDemoAction,
): SessionDemoState {
  switch (action.type) {
    case 'select':
      return action.state
    case 'retry':
      return current === 'error' ? 'anonymous' : current
    case 'logout':
      return 'anonymous'
    default:
      return assertNever(action)
  }
}

function assertNever(value: never): never {
  throw new Error(`Unexpected session demo action: ${String(value)}`)
}
