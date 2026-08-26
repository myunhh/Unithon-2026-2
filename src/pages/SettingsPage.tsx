import { useState } from 'react'
import { Alert } from '../components/Alert'
import { Button } from '../components/Button'
import { PageHeader } from '../components/PageHeader'
import { StatusBadge } from '../components/StatusBadge'
import {
  availableDemoProviders,
  DEMO_PROVIDER_FIXTURE,
  findDemoProvider,
  type DemoProvider,
  type DemoProviderId,
  type DemoProviderStatus,
} from './settings/providerFixtures'
import './SettingsPage.css'

type Notice = { tone: 'info' | 'success' | 'warning'; text: string }

const statusLabels = {
  valid: '연결됨',
  untested: '확인 전',
  invalid: '확인 필요',
  revoked: '삭제됨',
  reconnect_required: '재연결 필요',
} satisfies Record<DemoProviderStatus, string>

const statusTones = {
  valid: 'ready',
  untested: 'working',
  invalid: 'error',
  revoked: 'warning',
  reconnect_required: 'warning',
} satisfies Record<DemoProviderStatus, 'ready' | 'working' | 'warning' | 'error'>

export function SettingsPage() {
  const [providers, setProviders] = useState<readonly DemoProvider[]>(DEMO_PROVIDER_FIXTURE)
  const [notice, setNotice] = useState<Notice>({
    tone: 'info',
    text: '데모 모드입니다. 실제 제공자 API를 호출하거나 인증 정보를 저장하지 않습니다.',
  })
  const [confirmingDelete, setConfirmingDelete] = useState<DemoProviderId | null>(null)
  const [lastTested, setLastTested] = useState<DemoProviderId | null>(null)
  const availableCount = availableDemoProviders(providers).length

  function testProvider(id: DemoProviderId) {
    const provider = findDemoProvider(id, providers)
    if (!provider || provider.status === 'revoked') {
      setNotice({ tone: 'warning', text: '삭제된 연결은 데모 테스트를 실행할 수 없습니다.' })
      return
    }
    setProviders((current) => current.map((candidate) => candidate.id === id ? {
      ...candidate,
      status: 'valid',
      detail: '데모 연결 확인을 완료했습니다.',
      checkedAt: '방금 전',
    } : candidate))
    setLastTested(id)
    setNotice({ tone: 'success', text: `Demo only: ${provider.label} 연결 테스트를 시뮬레이션했습니다.` })
  }

  function deleteProvider() {
    if (!confirmingDelete) return
    const provider = findDemoProvider(confirmingDelete, providers)
    if (!provider) return
    setProviders((current) => current.map((candidate) => candidate.id === confirmingDelete ? {
      ...candidate,
      status: 'revoked',
      detail: '이 데모 화면에서 연결을 삭제했습니다.',
      publicValue: '연결 정보 없음',
      checkedAt: '방금 전',
    } : candidate))
    setConfirmingDelete(null)
    setLastTested(null)
    setNotice({ tone: 'success', text: `Demo only: ${provider.label} 연결을 화면에서 삭제했습니다. 인증 정보에는 접근하지 않았습니다.` })
  }

  function restoreProvider(id: DemoProviderId) {
    const provider = findDemoProvider(id, providers)
    if (!provider) return
    setProviders((current) => current.map((candidate) => candidate.id === id ? {
      ...candidate,
      status: 'untested',
      detail: '데모 연결 자리만 복원했습니다. 인증 정보는 입력되지 않았습니다.',
      publicValue: '확인 기록 없음',
      checkedAt: '아직 확인하지 않음',
    } : candidate))
    setNotice({ tone: 'info', text: `Demo only: ${provider.label} 연결 자리를 복원했습니다.` })
  }

  return (
    <section className="page settings-page" aria-label="설정">
      <PageHeader title="설정" description="연결 상태와 제공자 설정을 확인합니다. 이 화면의 동작은 데모 상태만 변경합니다." />
      <div className="settings-demo-banner" role="note">
        <strong id="settings-demo-title">제공자 설정 데모</strong>
        <span>BE-070 연결 전 UI 검증용입니다. 인증 정보 입력, 저장, 네트워크 요청은 구현하지 않았습니다.</span>
      </div>
      {notice ? <Alert tone={notice.tone} className="settings-notice">{notice.text}</Alert> : null}

      <div className="settings-summary" role="group" aria-label="제공자 환경 요약">
        <div className="stat"><span className="stat-label">지원 제공자</span><strong className="settings-summary-value">{providers.length}</strong></div>
        <div className="stat"><span className="stat-label">현재 연결됨</span><strong className="settings-summary-value">{availableCount}</strong></div>
        <div className="stat"><span className="stat-label">인증 정보</span><strong className="settings-summary-value">원문 비공개</strong></div>
        <div className="stat"><span className="stat-label">연결 방식</span><strong className="settings-summary-value">데모 상태</strong></div>
      </div>

      <ul className="settings-cli-list" aria-label="제공자 연결 상태">
        {providers.map((provider) => (
          <ProviderCard
            key={provider.id}
            provider={provider}
            isLastTested={lastTested === provider.id}
            isConfirmingDelete={confirmingDelete === provider.id}
            onCancelDelete={() => setConfirmingDelete(null)}
            onDelete={() => setConfirmingDelete(provider.id)}
            onConfirmDelete={deleteProvider}
            onRestore={() => restoreProvider(provider.id)}
            onTest={() => testProvider(provider.id)}
          />
        ))}
      </ul>
    </section>
  )
}

type ProviderCardProps = Readonly<{
  provider: DemoProvider
  isLastTested: boolean
  isConfirmingDelete: boolean
  onCancelDelete: () => void
  onDelete: () => void
  onConfirmDelete: () => void
  onRestore: () => void
  onTest: () => void
}>

function ProviderCard({ provider, isLastTested, isConfirmingDelete, onCancelDelete, onDelete, onConfirmDelete, onRestore, onTest }: ProviderCardProps) {
  const isRevoked = provider.status === 'revoked'
  return (
    <li className="card settings-provider-card settings-cli-item" data-provider={provider.id}>
      <div className="settings-card-heading">
        <div>
          <p className="settings-provider-kind">{provider.kind === 'remote-api' ? '원격 API' : '데스크톱 CLI'}</p>
          <h2 className="settings-cli-provider-name">{provider.label}</h2>
        </div>
        <StatusBadge tone={statusTones[provider.status]}>{statusLabels[provider.status]}</StatusBadge>
      </div>
      <p className="settings-provider-detail">{provider.detail}</p>
      <dl className="settings-facts">
        <div><dt>확인 결과</dt><dd>{provider.publicValue}</dd></div>
        <div><dt>상태</dt><dd>{provider.checkedAt}</dd></div>
        <div><dt>인증 정보</dt><dd>원문 표시 안 함</dd></div>
      </dl>
      <div className="settings-provider-actions">
        {!isRevoked ? <Button type="button" variant="secondary" onClick={onTest}>연결 테스트 (demo)</Button> : null}
        {!isRevoked ? <Button type="button" variant="danger" onClick={onDelete}>연결 삭제 (demo)</Button> : <Button type="button" variant="secondary" onClick={onRestore}>연결 자리 복원 (demo)</Button>}
      </div>
      {isLastTested ? <p className="settings-test-result" role="status">데모 테스트 결과: 연결 가능한 상태입니다. 실제 요청은 보내지 않았습니다.</p> : null}
      {isConfirmingDelete ? (
        <Alert tone="warning" className="settings-delete-confirmation">
          <span>{provider.label} 연결을 데모 화면에서 삭제할까요?</span>
          <span className="inline-actions">
            <Button type="button" variant="secondary" onClick={onCancelDelete}>취소</Button>
            <Button type="button" variant="danger" onClick={onConfirmDelete}>데모 삭제</Button>
          </span>
        </Alert>
      ) : null}
    </li>
  )
}
