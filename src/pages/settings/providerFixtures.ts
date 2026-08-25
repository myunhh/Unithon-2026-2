export const DEMO_PROVIDER_IDS = ['openrouter', 'claude-code', 'codex', 'agy'] as const

export type DemoProviderId = (typeof DEMO_PROVIDER_IDS)[number]

export type DemoProviderStatus = 'valid' | 'untested' | 'invalid' | 'revoked' | 'reconnect_required'

export type DemoProvider = Readonly<{
  id: DemoProviderId
  label: string
  kind: 'remote-api' | 'desktop-cli'
  scope: 'personal' | 'desktop'
  status: DemoProviderStatus
  detail: string
  publicValue: string
  checkedAt: string
}>

export const DEMO_PROVIDER_FIXTURE: readonly DemoProvider[] = [
  {
    id: 'openrouter',
    label: 'OpenRouter',
    kind: 'remote-api',
    scope: 'personal',
    status: 'valid',
    detail: '개인 연결이 준비되어 있습니다.',
    publicValue: 'openai/gpt-4o-mini',
    checkedAt: '오늘 09:42',
  },
  {
    id: 'claude-code',
    label: 'Claude Code',
    kind: 'desktop-cli',
    scope: 'desktop',
    status: 'valid',
    detail: '데스크톱 CLI가 설치되고 인증되어 있습니다.',
    publicValue: '설치 · 인증됨',
    checkedAt: '오늘 09:41',
  },
  {
    id: 'codex',
    label: 'Codex',
    kind: 'desktop-cli',
    scope: 'desktop',
    status: 'reconnect_required',
    detail: '데스크톱 CLI에서 다시 인증해야 합니다.',
    publicValue: '재연결 필요',
    checkedAt: '어제 18:20',
  },
  {
    id: 'agy',
    label: 'Agy',
    kind: 'desktop-cli',
    scope: 'desktop',
    status: 'untested',
    detail: '데스크톱 앱에서 아직 확인하지 않았습니다.',
    publicValue: '확인 기록 없음',
    checkedAt: '아직 확인하지 않음',
  },
]

export function findDemoProvider(id: DemoProviderId, providers: readonly DemoProvider[]): DemoProvider | undefined {
  return providers.find((provider) => provider.id === id)
}

export function availableDemoProviders(providers: readonly DemoProvider[]): readonly DemoProvider[] {
  return providers.filter((provider) => provider.status === 'valid')
}
