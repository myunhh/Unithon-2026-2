import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Alert } from '../components/Alert'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { Field } from '../components/Field'
import { Input } from '../components/Input'
import { PageHeader } from '../components/PageHeader'
import { StatusBadge } from '../components/StatusBadge'
import {
  combineSettingsProviders,
  planOpenRouterTest,
  providerClient,
  selectedProviderLabel,
  type DesktopProviderHealth,
  type OpenRouterTestResult,
  type ProviderStatus,
} from '../domain/providers'

type Operation = 'idle' | 'saving' | 'testing' | 'clearing'
type Notice = { tone: 'error' | 'success' | 'warning'; text: string } | null
type DesktopHealthState = 'idle' | 'loading' | 'ready' | 'error'

const cliProviders = [
  { id: 'claude-code', label: 'Claude Code' },
  { id: 'codex', label: 'Codex' },
  { id: 'agy', label: 'Agy' },
] as const

export function SettingsPage() {
  const desktop = typeof window === 'undefined' ? undefined : window.paperbridgeDesktop
  const isDesktop = Boolean(desktop)
  const [providerStatus, setProviderStatus] = useState<ProviderStatus | null>(null)
  const [statusLoading, setStatusLoading] = useState(true)
  const [apiKey, setApiKey] = useState('')
  const [modelId, setModelId] = useState('')
  const [operation, setOperation] = useState<Operation>('idle')
  const [notice, setNotice] = useState<Notice>(null)
  const [testResult, setTestResult] = useState<OpenRouterTestResult | null>(null)
  const [clearConfirmation, setClearConfirmation] = useState(false)
  const [desktopHealth, setDesktopHealth] = useState<readonly DesktopProviderHealth[]>([])
  const [desktopHealthState, setDesktopHealthState] = useState<DesktopHealthState>(isDesktop ? 'loading' : 'idle')
  const [desktopVersion, setDesktopVersion] = useState<string | null | undefined>(undefined)
  const operationController = useRef<AbortController | null>(null)
  const statusController = useRef<AbortController | null>(null)
  const statusRequest = useRef(0)
  const desktopHealthRequest = useRef(0)
  const isMounted = useRef(false)

  const providers = useMemo(
    () => combineSettingsProviders(providerStatus?.openRouter ?? null, isDesktop, desktopHealth),
    [desktopHealth, isDesktop, providerStatus],
  )
  const availableProviderCount = providers.filter((provider) => provider.available).length
  const latestDetection = latestDetectionTime(desktopHealth)
  const configured = providerStatus?.openRouter.configured === true

  useEffect(() => {
    isMounted.current = true
    const controller = new AbortController()
    const requestId = statusRequest.current + 1
    statusRequest.current = requestId
    statusController.current = controller
    let active = true

    void providerClient.getStatus(controller.signal)
      .then((nextStatus) => {
        if (!active || statusRequest.current !== requestId) return
        setProviderStatus(nextStatus)
        const openRouter = nextStatus.openRouter
        if (openRouter.configured) setModelId((current) => current || openRouter.modelId)
      })
      .catch((error: unknown) => {
        if (!active || statusRequest.current !== requestId || isAbortError(error)) return
        setNotice({ tone: 'error', text: 'AI 제공자 설정을 불러오지 못했습니다. 페이지를 새로고침한 뒤 다시 시도하세요.' })
      })
      .finally(() => {
        if (active && statusRequest.current === requestId) setStatusLoading(false)
      })

    if (desktop) {
      void desktop.getAppInfo()
        .then((appInfo) => {
          if (active) setDesktopVersion(safeVersion(appInfo.version))
        })
        .catch(() => {
          if (active) setDesktopVersion(null)
        })

      const requestId = desktopHealthRequest.current + 1
      desktopHealthRequest.current = requestId
      void readDesktopHealth(desktop, false)
        .then((health) => {
          if (!active || desktopHealthRequest.current !== requestId) return
          setDesktopHealth(health)
          setDesktopHealthState('ready')
        })
        .catch(() => {
          if (active && desktopHealthRequest.current === requestId) setDesktopHealthState('error')
        })
    }

    return () => {
      active = false
      isMounted.current = false
      controller.abort()
      operationController.current?.abort()
    }
  }, [desktop])

  function beginOperation(nextOperation: Exclude<Operation, 'idle'>): AbortController {
    if (nextOperation !== 'testing') {
      statusRequest.current += 1
      statusController.current?.abort()
    }
    operationController.current?.abort()
    const controller = new AbortController()
    operationController.current = controller
    setOperation(nextOperation)
    setNotice(null)
    return controller
  }

  async function saveOpenRouter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const controller = beginOperation('saving')
    try {
      const openRouter = await providerClient.saveOpenRouter({ apiKey, modelId }, controller.signal)
      if (!isMounted.current || operationController.current !== controller) return
      setProviderStatus({ storageConfigured: true, openRouter })
      setApiKey('')
      setClearConfirmation(false)
      setTestResult(null)
      setNotice({ tone: 'success', text: 'OpenRouter 설정을 저장했습니다. API 키 입력란은 비웠습니다.' })
    } catch (error) {
      if (!isMounted.current || operationController.current !== controller || isAbortError(error)) return
      setNotice({ tone: 'error', text: safeOperationError(error, 'OpenRouter 설정을 저장하지 못했습니다. 키와 모델 ID를 확인한 뒤 다시 시도하세요.') })
    } finally {
      if (isMounted.current && operationController.current === controller) {
        setOperation('idle')
        setStatusLoading(false)
      }
    }
  }

  async function testOpenRouter() {
    const plan = planOpenRouterTest({ apiKey, modelId }, providerStatus?.openRouter ?? null)
    if (plan.kind === 'unconfigured') {
      setNotice({ tone: 'warning', text: '먼저 API 키를 저장하거나, 테스트할 키와 모델 ID를 입력하세요.' })
      return
    }
    const controller = beginOperation('testing')
    try {
      const testInput = plan.kind === 'candidate'
        ? plan.candidate
        : plan.kind === 'saved-model'
          ? { modelId: plan.modelId }
          : undefined
      const result = await providerClient.testOpenRouter(testInput, controller.signal)
      if (!isMounted.current || operationController.current !== controller) return
      setTestResult(result)
      setNotice(result.ok
        ? { tone: 'success', text: 'OpenRouter 연결 테스트를 통과했습니다.' }
        : { tone: 'warning', text: 'OpenRouter 연결 테스트를 통과하지 못했습니다. 키, 모델, 제공자 상태를 확인한 뒤 다시 시도하세요.' })
    } catch (error) {
      if (!isMounted.current || operationController.current !== controller || isAbortError(error)) return
      setNotice({ tone: 'error', text: safeOperationError(error, 'OpenRouter 연결 테스트를 완료하지 못했습니다. 잠시 후 다시 시도하세요.') })
    } finally {
      if (isMounted.current && operationController.current === controller) setOperation('idle')
    }
  }

  async function clearOpenRouter() {
    const controller = beginOperation('clearing')
    try {
      const openRouter = await providerClient.clearOpenRouter(controller.signal)
      if (!isMounted.current || operationController.current !== controller) return
      setProviderStatus({ storageConfigured: true, openRouter })
      setApiKey('')
      setModelId('')
      setClearConfirmation(false)
      setTestResult(null)
      setNotice({ tone: 'success', text: '저장된 OpenRouter 키와 모델 ID를 삭제했습니다.' })
    } catch (error) {
      if (!isMounted.current || operationController.current !== controller || isAbortError(error)) return
      setNotice({ tone: 'error', text: safeOperationError(error, '저장된 OpenRouter 설정을 삭제하지 못했습니다. 잠시 후 다시 시도하세요.') })
    } finally {
      if (isMounted.current && operationController.current === controller) {
        setOperation('idle')
        setStatusLoading(false)
      }
    }
  }

  async function refreshDesktopHealth() {
    if (!desktop) return
    const requestId = desktopHealthRequest.current + 1
    desktopHealthRequest.current = requestId
    setDesktopHealthState('loading')
    try {
      const health = await readDesktopHealth(desktop, true)
      if (!isMounted.current || desktopHealthRequest.current !== requestId) return
      setDesktopHealth(health)
      setDesktopHealthState('ready')
    } catch {
      if (isMounted.current && desktopHealthRequest.current === requestId) setDesktopHealthState('error')
    }
  }

  return (
    <section className="page settings-page">
      <PageHeader
        title="설정"
        description="개인 OpenRouter 계정을 연결하거나 데스크톱 구독 CLI 상태를 확인합니다. 요청하기 전에는 제공자 테스트를 실행하지 않습니다."
      />

      <div className="settings-summary" aria-label="AI 제공자 환경 요약">
        <div className="stat">
          <span className="stat-label">실행 환경</span>
          <strong className="settings-summary-value">{isDesktop ? desktopVersion === undefined ? '데스크톱 앱' : desktopVersion ? `데스크톱 앱 · v${desktopVersion}` : '데스크톱 앱 · 버전 없음' : '브라우저'}</strong>
        </div>
        <div className="stat">
          <span className="stat-label">사용 가능한 제공자</span>
          <strong className="stat-value">{statusLoading || (isDesktop && desktopHealthState === 'loading') ? '확인 중' : providerStatus ? availableProviderCount : '확인 불가'}</strong>
        </div>
        <div className="stat">
          <span className="stat-label">기본·선택 제공자</span>
          <strong className="settings-summary-value">{statusLoading ? '확인 중' : providerStatus ? providerLabelKorean(selectedProviderLabel(providers)) : '확인 불가'}</strong>
        </div>
        <div className="stat">
          <span className="stat-label">최근 데스크톱 확인</span>
          <strong className="settings-summary-value">{isDesktop ? detectionLabel(desktopHealthState, latestDetection) : '데스크톱 앱 필요'}</strong>
        </div>
      </div>

      <p className="settings-next-step" role="status">
        {statusLoading ? '현재 제공자 상태를 확인하고 있습니다.' : configured ? '다음 단계: 모델 ID를 확인하고 필요할 때만 연결 테스트를 실행하세요.' : '다음 단계: OpenRouter API 키와 모델 ID를 입력해 설정을 저장하세요.'}
      </p>

      {notice ? <Alert tone={notice.tone} className="settings-notice">{notice.text}</Alert> : null}

      <div className="settings-provider-grid">
        <Card className="settings-provider-card">
          <div className="card-heading">
            <div>
              <h2 className="card-title">OpenRouter</h2>
              <p className="card-description">개인 API 키를 사용합니다. 저장 후에는 모델 ID만 화면에 표시됩니다.</p>
            </div>
            {statusLoading ? <StatusBadge tone="working">확인 중</StatusBadge> : !providerStatus ? <span className="settings-unavailable-badge">사용 불가</span> : configured ? <StatusBadge tone="ready">연결됨</StatusBadge> : <StatusBadge tone="warning">연결 안 됨</StatusBadge>}
          </div>

          <dl className="settings-facts">
            <div>
              <dt>제공자 저장소</dt>
              <dd>{statusLoading ? '확인 중' : providerStatus ? providerStatus.storageConfigured ? '연결됨' : '연결 안 됨' : '사용 불가'}</dd>
            </div>
            <div>
              <dt>저장된 모델 ID</dt>
              <dd>{configured ? providerStatus.openRouter.modelId : providerStatus ? '저장된 값 없음' : '사용 불가'}</dd>
            </div>
          </dl>

          <form className="settings-provider-form" noValidate onSubmit={saveOpenRouter}>
            <Field
              htmlFor="openrouter-api-key"
              label="OpenRouter API 키"
              help={configured ? '새 키를 입력하면 저장된 키를 교체합니다. 저장에 성공하면 입력란을 비웁니다.' : '이 키는 설정을 저장하거나 명시적으로 테스트할 때만 사용됩니다.'}
              helpId="openrouter-api-key-help"
            >
              <Input
                id="openrouter-api-key"
                type="password"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                autoComplete="new-password"
                spellCheck={false}
                aria-describedby="openrouter-api-key-help"
                disabled={operation !== 'idle'}
              />
            </Field>
            <Field
              htmlFor="openrouter-model-id"
              label="모델 ID"
              help="제공자의 모델 식별자를 입력하세요. 예: openai/gpt-4o-mini"
              helpId="openrouter-model-id-help"
            >
              <Input
                id="openrouter-model-id"
                type="text"
                value={modelId}
                onChange={(event) => setModelId(event.target.value)}
                autoComplete="off"
                spellCheck={false}
                aria-describedby="openrouter-model-id-help"
                disabled={operation !== 'idle'}
              />
            </Field>
            <p className="settings-cost-note">연결 테스트는 출력 토큰을 최대 1개 사용할 수 있으며, ‘연결 테스트’를 눌렀을 때만 실행됩니다.</p>
            <div className="inline-actions settings-provider-actions">
              <Button type="submit" disabled={operation !== 'idle'}>{operation === 'saving' ? '저장 중…' : configured ? '설정 교체' : '설정 저장'}</Button>
              <Button type="button" variant="secondary" disabled={operation !== 'idle'} onClick={() => void testOpenRouter()}>
                {operation === 'testing' ? '테스트 중…' : '연결 테스트'}
              </Button>
              {configured ? (
                <Button type="button" variant="danger" disabled={operation !== 'idle'} onClick={() => setClearConfirmation(true)}>저장된 키 삭제</Button>
              ) : null}
            </div>
          </form>

          {clearConfirmation ? (
            <Alert tone="warning" className="settings-clear-confirmation">
              <span>저장된 OpenRouter 키와 모델 ID를 삭제할까요? 되돌릴 수 없습니다.</span>
              <span className="inline-actions">
                <Button type="button" variant="secondary" disabled={operation !== 'idle'} onClick={() => setClearConfirmation(false)}>취소</Button>
                <Button type="button" variant="danger" disabled={operation !== 'idle'} onClick={() => void clearOpenRouter()}>{operation === 'clearing' ? '삭제 중…' : '영구 삭제'}</Button>
              </span>
            </Alert>
          ) : null}

          {testResult ? (
            <div className="settings-test-result" aria-live="polite">
              <StatusBadge tone={testResult.ok ? 'ready' : 'error'}>{testResult.ok ? '테스트 통과' : '테스트 실패'}</StatusBadge>
              <span>모델 {testResult.modelId} · {testResult.latencyMs}ms</span>
            </div>
          ) : null}
        </Card>

        <Card className="settings-provider-card">
          <div className="card-heading">
            <div>
              <h2 className="card-title">데스크톱 구독 CLI</h2>
              <p className="card-description">데스크톱 앱이 각 CLI의 설치·인증 여부를 확인합니다. CLI 인증 정보를 읽거나 요청하지 않습니다.</p>
            </div>
            {isDesktop ? <StatusBadge tone={desktopHealthState === 'error' ? 'error' : desktopHealthState === 'loading' ? 'working' : 'ready'}>{desktopHealthState === 'error' ? '확인 실패' : desktopHealthState === 'loading' ? '확인 중' : '데스크톱'}</StatusBadge> : <span className="settings-unavailable-badge">사용 불가</span>}
          </div>

          <ul className="settings-cli-list" aria-label="데스크톱 구독 CLI 설치·인증 상태">
            {cliProviders.map((provider) => {
              const health = desktopHealth.find((candidate) => candidate.providerId === provider.id)
              return <CliProviderStatus key={provider.id} label={provider.label} health={health} isDesktop={isDesktop} loading={desktopHealthState === 'loading'} />
            })}
          </ul>

          {isDesktop ? (
            <div className="inline-actions">
              <Button type="button" variant="secondary" disabled={desktopHealthState === 'loading'} onClick={() => void refreshDesktopHealth()}>{desktopHealthState === 'loading' ? '확인 중…' : '다시 확인'}</Button>
              {desktopHealthState === 'error' ? <span className="settings-inline-copy" aria-live="polite">데스크톱 CLI 상태를 읽지 못했습니다. 다시 확인해 보세요.</span> : null}
            </div>
          ) : <Alert tone="info">브라우저에서는 로컬 CLI를 확인할 수 없습니다. 데스크톱 앱을 설치하면 Claude Code, Codex, Agy 구독을 사용할 수 있습니다.</Alert>}
        </Card>
      </div>
    </section>
  )
}

function CliProviderStatus({ health, isDesktop, label, loading }: {
  health: DesktopProviderHealth | undefined
  isDesktop: boolean
  label: string
  loading: boolean
}) {
  let detection: string
  let status: ReactNode
  if (!isDesktop) {
    detection = '데스크톱 앱 필요'
    status = <span className="settings-unavailable-badge">사용 불가</span>
  } else if (loading && !health) {
    detection = '설치·인증 상태 확인 중'
    status = <StatusBadge tone="working">확인 중</StatusBadge>
  } else if (!health) {
    detection = '데스크톱 상태 결과 없음'
    status = <span className="settings-unavailable-badge">사용 불가</span>
  } else {
    detection = desktopHealthMessage(health)
    status = <StatusBadge tone={health.status === 'healthy' ? 'ready' : health.status === 'limited' ? 'warning' : 'error'}>{health.status === 'healthy' ? '정상' : health.status === 'limited' ? '제한됨' : '실패'}</StatusBadge>
  }
  return (
    <li className="settings-cli-item">
      <h3 className="settings-cli-provider-name">{label}</h3>
      <dl className="settings-cli-status">
        <div><dt>확인 결과</dt><dd>{detection}</dd></div>
        <div><dt>상태</dt><dd>{status}</dd></div>
      </dl>
    </li>
  )
}

async function readDesktopHealth(
  desktop: NonNullable<Window['paperbridgeDesktop']>,
  refresh: boolean,
): Promise<readonly DesktopProviderHealth[]> {
  const rawHealth = refresh ? await desktop.getDesktopProviderHealth({ refresh: true }) : await desktop.getDesktopProviderHealth()
  const byProvider = new Map<DesktopProviderHealth['providerId'], DesktopProviderHealth>()
  for (const raw of rawHealth) {
    const health = parseDesktopHealth(raw)
    if (health && !byProvider.has(health.providerId)) byProvider.set(health.providerId, health)
  }
  return [...byProvider.values()]
}

function parseDesktopHealth(value: unknown): DesktopProviderHealth | null {
  if (!isRecord(value) || !isDesktopProviderId(value.providerId) || !isDesktopStatus(value.status) || typeof value.detected !== 'boolean' || typeof value.authenticated !== 'boolean' || !isTimestamp(value.checkedAt)) return null
  return {
    providerId: value.providerId,
    status: value.status,
    detected: value.detected,
    authenticated: value.authenticated,
    checkedAt: value.checkedAt,
  }
}

function isDesktopProviderId(value: unknown): value is DesktopProviderHealth['providerId'] {
  return value === 'claude-code' || value === 'codex' || value === 'agy'
}

function isDesktopStatus(value: unknown): value is DesktopProviderHealth['status'] {
  return value === 'healthy' || value === 'limited' || value === 'failed'
}

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 64 && Number.isFinite(Date.parse(value))
}

function desktopHealthMessage(health: DesktopProviderHealth): string {
  if (!health.detected) return '설치되지 않음. 데스크톱 CLI를 설치한 뒤 다시 확인하세요.'
  if (!health.authenticated) return '설치됐지만 인증이 필요합니다. 제공자 CLI에서 로그인한 뒤 다시 확인하세요.'
  if (health.status === 'failed') return '설치·인증됐지만 상태 확인에 실패했습니다. CLI 문제를 해결한 뒤 다시 확인하세요.'
  if (health.status === 'limited') return '설치·인증됐지만 사용 가능 범위가 제한됩니다.'
  return '설치·인증됨'
}

function latestDetectionTime(health: readonly DesktopProviderHealth[]): string | null {
  const latest = health.reduce<number | null>((current, item) => {
    const timestamp = Date.parse(item.checkedAt)
    return current === null || timestamp > current ? timestamp : current
  }, null)
  return latest === null ? null : new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(latest))
}

function detectionLabel(state: DesktopHealthState, latest: string | null): string {
  if (state === 'loading') return '확인 중'
  if (state === 'error') return '확인 불가'
  return latest ?? '확인 기록 없음'
}

function providerLabelKorean(label: string): string {
  if (label === 'OpenRouter') return 'OpenRouter'
  if (label === 'Claude Code') return 'Claude Code'
  if (label === 'Codex') return 'Codex'
  if (label === 'Agy') return 'Agy'
  return label
}

function safeVersion(value: unknown): string | null {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/.test(value) ? value : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

function safeOperationError(error: unknown, fallback: string): string {
  return error instanceof Error && error.name === 'ProviderInputError' ? error.message : fallback
}
