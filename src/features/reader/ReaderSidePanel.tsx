import type { KeyboardEvent } from 'react'
import { Alert } from '../../components/Alert'
import { AppLink } from '../../routes/AppLink'
import { Button } from '../../components/Button'
import { Card } from '../../components/Card'
import { EmptyRow } from '../../components/EmptyRow'
import { StatusBadge } from '../../components/StatusBadge'
import type { ProviderStatus } from '../../domain/providers'
import type { ReaderHighlight } from '../../domain/reader'
import type { PdfObjectGraph, SelectionAnchor } from '../../domain/types'
import type { AgentTask, ReaderPanel, ReaderRunState } from './reader-state'
import { READER_PANELS } from './reader-state'

const parseLabels = { queued: '파싱 대기', extracting: '원문 확인 중', ready: '준비 완료', error: '확인 필요' } as const
const fileLabels = { loading: '파일 불러오는 중', ready: '파일 준비 완료', error: '파일 확인 필요' } as const

function formatDate(timestamp: string): string {
  const date = new Date(timestamp)
  return Number.isNaN(date.getTime()) ? '시간 정보 없음' : new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

export type ReaderSidePanelProps = {
  readonly panel: ReaderPanel
  readonly fileStatus: keyof typeof fileLabels
  readonly parseStatus: keyof typeof parseLabels
  readonly graph: PdfObjectGraph | null
  readonly selection: SelectionAnchor | null
  readonly run: ReaderRunState
  readonly highlights: readonly ReaderHighlight[]
  readonly providerStatus: ProviderStatus | null
  readonly onPanelChange: (panel: ReaderPanel) => void
  readonly onOpenSettings: () => void
  readonly onCancelRun: () => void
  readonly onRetryRun: (task: AgentTask) => void
  readonly onDeleteHighlight: (highlight: ReaderHighlight) => void
  readonly onMoveToHighlight: (highlight: ReaderHighlight) => void
}

export function ReaderSidePanel({ panel, fileStatus, parseStatus, graph, selection, run, highlights, providerStatus, onPanelChange, onOpenSettings, onCancelRun, onRetryRun, onDeleteHighlight, onMoveToHighlight }: ReaderSidePanelProps) {
  const scannedPageCount = graph?.pages.filter((page) => page.textItems.length === 0).length ?? 0
  const blockCount = graph?.pages.reduce((total, page) => total + page.blocks.length, 0) ?? 0
  const retryTask = run.task
  const handlePanelTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, tab: ReaderPanel) => {
    const currentIndex = READER_PANELS.indexOf(tab)
    let nextIndex: number | null = null
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % READER_PANELS.length
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + READER_PANELS.length) % READER_PANELS.length
    else if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = READER_PANELS.length - 1
    if (nextIndex === null) return
    event.preventDefault()
    const nextPanel = READER_PANELS[nextIndex]
    onPanelChange(nextPanel)
    document.getElementById(`reader-tab-${nextPanel}`)?.focus()
  }
  return (
    <Card as="aside" className="reader-sidepanel" aria-label="리더 세부 정보">
      <div className="reader-panel-tabs" role="tablist" aria-label="리더 보조 패널">
        {READER_PANELS.map((tab) => <button className="reader-panel-tab" id={`reader-tab-${tab}`} key={tab} type="button" role="tab" tabIndex={panel === tab ? 0 : -1} aria-selected={panel === tab} aria-controls={`reader-panel-${tab}`} onClick={() => onPanelChange(tab)} onKeyDown={(event) => handlePanelTabKeyDown(event, tab)}>{tab === 'info' ? '문서 정보' : tab === 'chat' ? 'AI 작업' : `하이라이트 (${highlights.length})`}</button>)}
      </div>

      {panel === 'info' ? <div id="reader-panel-info" role="tabpanel" aria-labelledby="reader-tab-info" className="reader-panel-content">
        <div><p className="section-label">독립 상태</p><h2 className="card-title">원문 정보</h2></div>
        <dl className="detail-list">
          <div><dt>파일</dt><dd>{fileLabels[fileStatus]}</dd></div>
          <div><dt>파싱</dt><dd>{parseLabels[parseStatus]}</dd></div>
          <div><dt>쪽 수</dt><dd>{graph?.pages.length ?? 0}</dd></div>
          <div><dt>텍스트 블록</dt><dd>{blockCount}</dd></div>
          <div><dt>스캔 쪽</dt><dd>{scannedPageCount}</dd></div>
          <div><dt>선택</dt><dd>{selection ? `${selection.pageNumber}쪽` : '없음'}</dd></div>
        </dl>
        <Alert tone="info">파일·파싱·뷰포트·선택·실행 상태가 서로 독립적으로 표시됩니다.</Alert>
      </div> : null}

      {panel === 'chat' ? <div id="reader-panel-chat" role="tabpanel" aria-labelledby="reader-tab-chat" className="reader-panel-content">
        <div><p className="section-label">AI 실행 환경</p><h2 className="card-title">선택한 문장 작업</h2><p className="card-description">원문 위치를 근거로 설명하거나 번역합니다.</p></div>
        {providerStatus?.openRouter.configured ? <p className="agent-provider-state"><StatusBadge tone="ready">연결됨</StatusBadge><span>OpenRouter · {providerStatus.openRouter.modelId}</span></p> : null}
        {run.status === 'error' && run.error ? <Alert tone="error"><span>{run.error}</span><AppLink className="button button--secondary" href="/settings" onNavigate={onOpenSettings}>설정 열기</AppLink></Alert> : null}
        {run.status === 'checking-provider' ? <Alert tone="info"><span>제공자 상태를 확인하고 실행을 준비하는 중입니다.</span><Button variant="secondary" onClick={onCancelRun}>취소</Button></Alert> : null}
        {run.status === 'cancelled' ? <Alert tone="warning">AI 실행을 취소했습니다. 같은 선택 영역에서 다시 실행할 수 있습니다.</Alert> : null}
        {selection ? <div className="agent-selection-card"><span className="section-label">{selection.pageNumber}쪽 선택 영역</span><p className="reader-selection-context">{selection.selectedText || '선택한 영역'}</p>{run.status === 'idle' ? <p className="agent-next-step">위 툴바에서 설명 또는 번역을 시작하세요.</p> : null}</div> : <EmptyRow>원문 텍스트를 선택하면 설명과 번역을 실행할 수 있습니다.</EmptyRow>}
        {run.task && (run.status === 'running' || run.status === 'completed') ? <section className="agent-result" aria-live="polite" aria-busy={run.status === 'running'}><div className="agent-result-heading"><div><span className="section-label">{run.task === 'explain' ? '설명 결과' : '번역 결과'}</span><strong>{run.status === 'running' ? '생성 중…' : '완료'}</strong></div>{run.status === 'running' ? <Button variant="secondary" onClick={onCancelRun}>실행 취소</Button> : null}</div><p className="agent-result-text">{run.text || '응답을 기다리는 중…'}</p></section> : null}
        {retryTask && run.status === 'error' ? <div className="agent-retry-row"><span className="settings-inline-copy">문제 해결 후 같은 선택 영역에서 다시 실행하세요.</span><Button variant="secondary" onClick={() => onRetryRun(retryTask)}>다시 실행</Button></div> : null}
      </div> : null}

      {panel === 'highlights' ? <div id="reader-panel-highlights" role="tabpanel" aria-labelledby="reader-tab-highlights" className="reader-panel-content">
        <div><p className="section-label">수동 하이라이트</p><h2 className="card-title">저장된 선택 근거</h2></div>
        {highlights.length === 0 ? <EmptyRow>아직 저장한 하이라이트가 없습니다. 읽을 수 있는 텍스트를 선택한 뒤 하이라이트를 저장하세요.</EmptyRow> : <ol className="highlight-list">{highlights.map((highlight) => <li key={highlight.id}><button className="highlight-jump" type="button" onClick={() => onMoveToHighlight(highlight)}><span>{highlight.anchor.pageNumber}쪽 · {formatDate(highlight.createdAt)}</span><strong>{highlight.selectedText || '선택한 PDF 영역'}</strong></button><Button variant="secondary" onClick={() => onDeleteHighlight(highlight)}>삭제</Button></li>)}</ol>}
      </div> : null}
    </Card>
  )
}
