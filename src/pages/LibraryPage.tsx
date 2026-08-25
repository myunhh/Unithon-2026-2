import { useState } from 'react'
import { Alert } from '../components/Alert'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { PageHeader } from '../components/PageHeader'
import { Stat } from '../components/Stat'
import { StatusBadge } from '../components/StatusBadge'
import {
  advanceDemoPage,
  getDemoPage,
  LIBRARY_DEMO_MODES,
  retryDemoList,
  selectDemoMode,
  type LibraryDemoMode,
  type LibraryDemoViewState,
} from './library/demoFixtures'
import './LibraryPage.css'

type LibraryPageProps = {
  onNavigate: (path: string) => void
}

const MODE_LABELS: Readonly<Record<LibraryDemoMode, string>> = {
  'has-more': '목록 있음',
  empty: '빈 목록',
  error: '오류',
  loading: '불러오는 중',
}

const MODE_DESCRIPTIONS: Readonly<Record<LibraryDemoMode, string>> = {
  'has-more': '문서가 있고 다음 데모 커서 페이지를 불러올 수 있습니다.',
  empty: '문서가 아직 없는 보관함을 한 줄 빈 상태로 보여줍니다.',
  error: '목록을 읽지 못한 상황과 안전한 재시도 안내를 보여줍니다.',
  loading: '목록을 기다리는 동안 같은 카드 구조를 유지합니다.',
}

function stateAnnouncement(state: LibraryDemoViewState): string {
  if (state.mode === 'has-more') {
    const page = getDemoPage(state.pageIndex)
    return `문서 목록 데모 ${page.pageNumber}페이지. ${page.items.length}개의 문서가 표시되었습니다.`
  }
  if (state.mode === 'empty') return '문서 목록 데모가 빈 목록 상태로 전환되었습니다.'
  if (state.mode === 'error') return '문서 목록 데모가 오류 상태로 전환되었습니다.'
  return '문서 목록 데모가 불러오는 중 상태로 전환되었습니다.'
}

function EmptyState() {
  return <p className="library-empty-row">아직 업로드한 문서가 없습니다.</p>
}

function LoadingState() {
  return (
    <div className="library-loading-state" role="status" aria-label="문서 목록을 불러오는 중">
      <div className="library-skeleton-row" aria-hidden="true">
        <span className="library-skeleton-line library-skeleton-line--title" />
        <span className="library-skeleton-line library-skeleton-line--meta" />
      </div>
      <div className="library-skeleton-row" aria-hidden="true">
        <span className="library-skeleton-line library-skeleton-line--title" />
        <span className="library-skeleton-line library-skeleton-line--meta" />
      </div>
      <p className="library-loading-copy">문서 목록을 불러오는 중…</p>
    </div>
  )
}

function DocumentRows({ state }: { state: LibraryDemoViewState }) {
  const page = getDemoPage(state.pageIndex)

  return (
    <ul className="library-document-list" aria-label={`데모 문서 ${page.pageNumber}페이지`}>
      {page.items.map((document) => (
        <li className="library-document-row" key={document.key}>
          <div className="library-document-summary">
            <span className="library-document-name">{document.title}</span>
            <span className="library-document-meta">{document.details}</span>
          </div>
          <StatusBadge tone={document.statusTone}>{document.statusLabel}</StatusBadge>
        </li>
      ))}
    </ul>
  )
}

export function LibraryPage(_props: LibraryPageProps) {
  const [state, setState] = useState<LibraryDemoViewState>(() => selectDemoMode('has-more'))
  const [announcement, setAnnouncement] = useState(() => stateAnnouncement(selectDemoMode('has-more')))
  const page = getDemoPage(state.pageIndex)
  const isLoading = state.mode === 'loading'
  const isError = state.mode === 'error'
  const isEmpty = state.mode === 'empty'
  const hasMore = state.mode === 'has-more' && page.hasNextPage

  const chooseMode = (mode: LibraryDemoMode) => {
    const nextState = selectDemoMode(mode)
    setState(nextState)
    setAnnouncement(stateAnnouncement(nextState))
  }

  const showNextPage = () => {
    const nextState = advanceDemoPage(state)
    if (nextState.pageIndex === state.pageIndex) return
    setState(nextState)
    setAnnouncement(stateAnnouncement(nextState))
  }

  const retry = () => {
    const nextState = retryDemoList()
    setState(nextState)
    setAnnouncement('데모 목록을 다시 표시했습니다. 첫 번째 커서 페이지입니다.')
  }

  return (
    <section className="page library-page">
      <PageHeader
        title="문서 보관함"
        description="문서 목록과 커서 페이지 이동 상태를 확인합니다. 업로드와 실제 API 연결은 아직 열려 있지 않습니다."
      />

      <div className="library-page-stack">
        <Card className="library-demo-notice" aria-label="FE-020 데모 경계">
          <div className="library-demo-notice-copy">
            <div className="library-demo-notice-heading">
              <h2 className="library-section-title">문서 목록 데모</h2>
              <StatusBadge tone="warning">MOCK ONLY · FE-020</StatusBadge>
            </div>
            <p className="library-section-description">
              BE-042가 준비되기 전까지 화면 상태와 커서 이동만 확인하는 고정 fixture입니다. 서버 문서나 개인 정보는 읽지 않습니다.
            </p>
          </div>
        </Card>

        <Card className="library-state-card" aria-labelledby="library-state-title">
          <div className="library-card-heading">
            <div>
              <h2 className="library-section-title" id="library-state-title">상태 데모</h2>
              <p className="library-section-description">버튼을 선택하면 목록 카드가 해당 상태로 바뀝니다.</p>
            </div>
            <StatusBadge tone={isError ? 'error' : isLoading ? 'working' : isEmpty ? 'warning' : 'ready'}>
              {MODE_LABELS[state.mode]}
            </StatusBadge>
          </div>

          <div className="library-state-controls" role="group" aria-label="문서 목록 데모 상태 선택">
            {LIBRARY_DEMO_MODES.map((mode) => (
              <Button
                className="library-state-button"
                key={mode}
                variant={state.mode === mode ? 'primary' : 'secondary'}
                aria-pressed={state.mode === mode}
                onClick={() => chooseMode(mode)}
              >
                {MODE_LABELS[mode]}
              </Button>
            ))}
          </div>
          <p className="library-state-description" aria-live="polite">{MODE_DESCRIPTIONS[state.mode]}</p>
        </Card>

        <Card
          as="section"
          flush
          className="library-document-card"
          aria-labelledby="library-documents-title"
          aria-busy={isLoading}
        >
          <div className="library-document-header">
            <div>
              <h2 className="library-section-title" id="library-documents-title">문서 목록</h2>
              <p className="library-section-description">현재 페이지의 문서와 다음 데모 커서 상태입니다.</p>
            </div>
            <div className="library-page-indicator" role="group" aria-label="데모 페이지">
              <span>페이지</span>
              <strong>{isLoading || isEmpty || isError ? '—' : `${page.pageNumber} / ${page.totalPages}`}</strong>
            </div>
          </div>

          {isLoading ? <LoadingState /> : null}
          {isError ? (
            <Alert className="library-document-alert" tone="error">
              <span><strong>목록을 불러오지 못했습니다.</strong> 데모 오류 상태입니다. 다시 시도하면 첫 페이지로 돌아갑니다.</span>
              <Button variant="secondary" onClick={retry}>다시 시도</Button>
            </Alert>
          ) : null}
          {isEmpty ? <EmptyState /> : null}
          {!isLoading && !isError && !isEmpty ? <DocumentRows state={state} /> : null}

          <nav className="library-pagination" aria-label="데모 페이지 이동">
            <div className="library-pagination-copy">
              <span className="library-pagination-label">커서 상태</span>
              <span aria-live="polite">{hasMore ? '다음 페이지가 있습니다 · mock cursor' : state.mode === 'has-more' ? '마지막 데모 페이지입니다.' : '현재 상태에서는 사용할 수 없습니다.'}</span>
            </div>
            {hasMore ? (
              <Button variant="secondary" onClick={showNextPage}>
                다음 문서 페이지 보기
              </Button>
            ) : null}
          </nav>
        </Card>

        <div className="library-demo-stats" role="group" aria-label="문서 목록 데모 요약">
          <Stat label="현재 문서" value={isLoading || isEmpty || isError ? '—' : page.items.length} description="화면에 표시된 fixture" />
          <Stat label="페이지" value={isLoading || isEmpty || isError ? '—' : `${page.pageNumber}/${page.totalPages}`} description="mock cursor 기준" />
          <Stat label="다음 페이지" value={hasMore ? '있음' : '없음'} description="서버 연결 전 데모" />
        </div>
      </div>

      <p className="visually-hidden" role="status" aria-live="polite">{announcement}</p>
    </section>
  )
}
