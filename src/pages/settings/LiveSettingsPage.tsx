import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Alert } from '../../components/Alert'
import { Button } from '../../components/Button'
import { PageHeader } from '../../components/PageHeader'
import { StatusBadge } from '../../components/StatusBadge'
import {
  providerClient,
  type DesktopProviderHealth,
  type DesktopProviderId,
  type ProviderStatus,
} from '../../domain/providers'
import '../SettingsPage.css'

type Notice = Readonly<{ tone: 'info' | 'success' | 'warning'; text: string }>

const desktopProviders: readonly Readonly<{ id: DesktopProviderId; label: string }>[] = [
  { id: 'claude-code', label: 'Claude Code' },
  { id: 'codex', label: 'Codex' },
  { id: 'agy', label: 'Agy' },
]

async function requestProviderState(
  desktopBridge: Window['paperbridgeDesktop'],
  refreshDesktop: boolean,
  signal?: AbortSignal,
): Promise<Readonly<{ status: ProviderStatus; health: readonly DesktopProviderHealth[] }>> {
  const [status, health] = await Promise.all([
    providerClient.getStatus(signal),
    desktopBridge?.getDesktopProviderHealth({ refresh: refreshDesktop }) ?? Promise.resolve([]),
  ])
  return { status, health }
}

export function LiveSettingsPage() {
  const desktopBridge = typeof window === 'undefined' ? undefined : window.paperbridgeDesktop
  const [status, setStatus] = useState<ProviderStatus | null>(null)
  const [desktopHealth, setDesktopHealth] = useState<readonly DesktopProviderHealth[]>([])
  const [apiKey, setApiKey] = useState('')
  const [modelId, setModelId] = useState('openai/gpt-4o-mini')
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)

  const loadProviders = useCallback(async (refreshDesktop: boolean, signal?: AbortSignal): Promise<void> => {
    try {
      const next = await requestProviderState(desktopBridge, refreshDesktop, signal)
      setStatus(next.status)
      setDesktopHealth(next.health)
      if (next.status.openRouter.configured) setModelId(next.status.openRouter.modelId)
      setNotice(null)
    } catch (error) {
      if ((error as DOMException).name !== 'AbortError') {
        setNotice({ tone: 'warning', text: '제공자 상태를 불러오지 못했습니다. API 서버 연결을 확인하세요.' })
      }
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [desktopBridge])

  useEffect(() => {
    const controller = new AbortController()
    void requestProviderState(desktopBridge, false, controller.signal).then((next) => {
      setStatus(next.status)
      setDesktopHealth(next.health)
      if (next.status.openRouter.configured) setModelId(next.status.openRouter.modelId)
      setNotice(null)
    }).catch((error: unknown) => {
      if ((error as DOMException).name !== 'AbortError') {
        setNotice({ tone: 'warning', text: '제공자 상태를 불러오지 못했습니다. API 서버 연결을 확인하세요.' })
      }
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false)
    })
    return () => controller.abort()
  }, [desktopBridge])

  async function saveOpenRouter(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (pending) return
    setPending(true)
    setNotice(null)
    try {
      const openRouter = await providerClient.saveOpenRouter({ apiKey, modelId })
      setStatus((current) => ({ storageConfigured: current?.storageConfigured ?? true, openRouter }))
      setApiKey('')
      setNotice({ tone: 'success', text: 'OpenRouter 연결을 암호화해 저장했습니다.' })
    } catch {
      setNotice({ tone: 'warning', text: 'OpenRouter 연결을 저장하지 못했습니다. 키와 서버 암호화 설정을 확인하세요.' })
    } finally {
      setPending(false)
    }
  }

  async function testOpenRouter(): Promise<void> {
    if (pending) return
    setPending(true)
    setNotice(null)
    try {
      const result = apiKey
        ? await providerClient.testOpenRouter({ apiKey, modelId })
        : status?.openRouter.configured
          ? await providerClient.testOpenRouter(modelId === status.openRouter.modelId ? undefined : { modelId })
          : null
      if (!result) {
        setNotice({ tone: 'warning', text: '테스트할 API 키를 입력하거나 저장된 연결을 먼저 준비하세요.' })
      } else if (result.ok) {
        setNotice({ tone: 'success', text: `${result.modelId} 연결을 확인했습니다. 응답 시간 ${result.latencyMs}ms.` })
      } else {
        setNotice({ tone: 'warning', text: `연결 확인 실패: ${result.error.message}` })
      }
    } catch {
      setNotice({ tone: 'warning', text: 'OpenRouter 연결 테스트를 완료하지 못했습니다.' })
    } finally {
      setPending(false)
    }
  }

  async function clearOpenRouter(): Promise<void> {
    if (pending) return
    setPending(true)
    setNotice(null)
    try {
      const openRouter = await providerClient.clearOpenRouter()
      setStatus((current) => ({ storageConfigured: current?.storageConfigured ?? true, openRouter }))
      setApiKey('')
      setNotice({ tone: 'success', text: '저장된 OpenRouter 연결을 삭제했습니다.' })
    } catch {
      setNotice({ tone: 'warning', text: 'OpenRouter 연결을 삭제하지 못했습니다.' })
    } finally {
      setPending(false)
    }
  }

  const openRouterConfigured = status?.openRouter.configured === true
  const availableDesktopCount = desktopHealth.filter((health) => health.detected && health.authenticated && health.status !== 'failed').length

  return (
    <section className="page settings-page" aria-label="설정">
      <PageHeader title="설정" description="원격 API와 데스크톱 CLI의 실제 연결 상태를 관리합니다." />
      {notice ? <Alert tone={notice.tone} className="settings-notice">{notice.text}</Alert> : null}

      <div className="settings-summary" role="group" aria-label="제공자 환경 요약">
        <div className="stat"><span className="stat-label">지원 제공자</span><strong className="settings-summary-value">4</strong></div>
        <div className="stat"><span className="stat-label">현재 연결됨</span><strong className="settings-summary-value">{loading ? '—' : Number(openRouterConfigured) + availableDesktopCount}</strong></div>
        <div className="stat"><span className="stat-label">인증 정보</span><strong className="settings-summary-value">원문 비공개</strong></div>
        <div className="stat"><span className="stat-label">서버 저장소</span><strong className="settings-summary-value">{loading ? '확인 중' : status?.storageConfigured ? '암호화됨' : '설정 필요'}</strong></div>
      </div>

      <ul className="settings-cli-list" aria-label="제공자 연결 상태">
        <li className="card settings-provider-card settings-cli-item" data-provider="openrouter">
          <div className="settings-card-heading"><div><p className="settings-provider-kind">원격 API</p><h2 className="settings-cli-provider-name">OpenRouter</h2></div><StatusBadge tone={openRouterConfigured ? 'ready' : status?.storageConfigured ? 'working' : 'warning'}>{loading ? '확인 중' : openRouterConfigured ? '연결됨' : '연결 필요'}</StatusBadge></div>
          <p className="settings-provider-detail">브라우저에는 키를 남기지 않고 서버 암호화 저장소에서 관리합니다.</p>
          <form className="settings-provider-form" onSubmit={(event) => void saveOpenRouter(event)}>
            <label>API 키<input className="input" name="apiKey" type="password" autoComplete="off" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={openRouterConfigured ? '새 키로 교체할 때만 입력' : 'OpenRouter API 키'} disabled={pending} /></label>
            <label>모델 ID<input className="input" name="modelId" type="text" value={modelId} onChange={(event) => setModelId(event.target.value)} disabled={pending} required /></label>
            <div className="settings-provider-actions"><Button type="submit" disabled={pending || !status?.storageConfigured || !apiKey}>연결 저장</Button><Button type="button" variant="secondary" onClick={() => void testOpenRouter()} disabled={pending}>연결 테스트</Button>{openRouterConfigured ? <Button type="button" variant="danger" onClick={() => void clearOpenRouter()} disabled={pending}>연결 삭제</Button> : null}</div>
          </form>
          <dl className="settings-facts"><div><dt>확인 결과</dt><dd>{openRouterConfigured ? status.openRouter.modelId : '연결 정보 없음'}</dd></div><div><dt>상태</dt><dd>{loading ? '불러오는 중' : openRouterConfigured ? '사용 가능' : '설정 필요'}</dd></div><div><dt>인증 정보</dt><dd>원문 표시 안 함</dd></div></dl>
        </li>
        {desktopProviders.map((provider) => <DesktopProviderCard key={provider.id} provider={provider} health={desktopHealth.find((health) => health.providerId === provider.id)} isDesktop={Boolean(desktopBridge)} />)}
      </ul>
      <div className="settings-provider-actions"><Button type="button" variant="secondary" onClick={() => { setLoading(true); void loadProviders(true) }} disabled={loading || pending}>연결 상태 새로고침</Button></div>
    </section>
  )
}

function DesktopProviderCard({ provider, health, isDesktop }: Readonly<{ provider: Readonly<{ id: DesktopProviderId; label: string }>; health: DesktopProviderHealth | undefined; isDesktop: boolean }>) {
  const available = Boolean(health?.detected && health.authenticated && health.status !== 'failed')
  return (
    <li className="card settings-provider-card settings-cli-item" data-provider={provider.id}>
      <div className="settings-card-heading"><div><p className="settings-provider-kind">데스크톱 CLI</p><h2 className="settings-cli-provider-name">{provider.label}</h2></div><StatusBadge tone={available ? 'ready' : health?.status === 'failed' ? 'error' : 'warning'}>{available ? '연결됨' : isDesktop ? '연결 필요' : '데스크톱 전용'}</StatusBadge></div>
      <p className="settings-provider-detail">{isDesktop ? '설치 및 인증 상태를 데스크톱 브리지에서 직접 확인합니다.' : '데스크톱 앱의 설치·인증 상태를 보여줍니다.'}</p>
      <dl className="settings-facts"><div><dt>확인 결과</dt><dd>{health?.detected ? health.authenticated ? '설치 · 인증됨' : '인증 필요' : '감지되지 않음'}</dd></div><div><dt>상태</dt><dd>{health?.checkedAt ? formatDate(health.checkedAt) : '확인 기록 없음'}</dd></div><div><dt>인증 정보</dt><dd>원문 표시 안 함</dd></div></dl>
    </li>
  )
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
}
