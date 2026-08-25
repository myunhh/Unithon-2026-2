import { useState } from 'react'
import { Alert } from '../components/Alert'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { PageHeader } from '../components/PageHeader'
import { Stat } from '../components/Stat'
import { StatusBadge } from '../components/StatusBadge'
import { LibraryDocumentTable } from './library/LibraryDocumentTable'
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

type DemoControlsProps = {
  readonly state: LibraryDemoViewState
  readonly onChooseMode: (mode: LibraryDemoMode) => void
}

function DemoControls({ state, onChooseMode }: DemoControlsProps) {
  return (
    <details className="library-demo-controls">
      <summary>
        <span>상태 데모</span>
        <StatusBadge tone={state.mode === 'error' ? 'error' : state.mode === 'loading' ? 'working' : state.mode === 'empty' ? 'warning' : 'ready'}>
          {MODE_LABELS[state.mode]}
        </StatusBadge>
      </summary>
      <p className="library-section-description">버튼을 선택하면 목록 표가 해당 상태로 바뀝니다.</p>
      <div className="library-state-controls" role="group" aria-label="문서 목록 데모 상태 선택">
        {LIBRARY_DEMO_MODES.map((mode) => (
          <Button
            className="library-state-button"
            key={mode}
            variant={state.mode === mode ? 'primary' : 'secondary'}
            aria-pressed={state.mode === mode}
            onClick={() => onChooseMode(mode)}
          >
            {MODE_LABELS[mode]}
          </Button>
        ))}
      </div>
      <p className="library-state-description" aria-live="polite">{MODE_DESCRIPTIONS[state.mode]}</p>
      <p className="library-demo-boundary">BE-042가 준비되기 전까지 화면 상태와 커서 이동만 확인하는 고정 fixture입니다. 서버 문서나 개인 정보는 읽지 않습니다.</p>
    </details>
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
        title="라이브러리"
        description="업로드한 논문을 다시 엽니다."
      />

      <div className="library-page-stack">
        <section className="library-upload-layout" aria-label="문서 업로드와 보관함 요약">
          <Card as="section" className="library-upload-card" aria-label="문서 업로드 (준비 중)">
            <div className="library-upload-field">
              <span className="library-field-label" id="library-pdf-label">PDF 파일</span>
              <div className="library-upload-row">
                <label className="library-file-dropzone" aria-disabled="true" htmlFor="library-pdf-file">
                  <span className="library-file-name">파일을 선택하거나 여기로 끌어다 놓으세요</span>
                  <span className="library-file-copy">PDF · 최대 50MB</span>
                </label>
                <Button className="library-upload-button" disabled aria-disabled="true">업로드</Button>
              </div>
              <input
                className="visually-hidden"
                id="library-pdf-file"
                type="file"
                accept="application/pdf"
                disabled
                aria-labelledby="library-pdf-label"
                aria-describedby="library-pdf-help library-pdf-boundary"
              />
              <p className="library-upload-help" id="library-pdf-help">업로드한 논문은 비공개로 보관됩니다.</p>
              <p className="library-upload-boundary" id="library-pdf-boundary" role="note">업로드와 실제 API 연결은 아직 열려 있지 않습니다.</p>
            </div>
          </Card>
          <Card as="aside" className="library-saved-card" aria-label="보관함 요약">
            <Stat label="저장된 논문" value={isLoading || isEmpty || isError ? '—' : page.savedCount} description="비공개 PDF 기록" />
          </Card>
        </section>

        <Card
          as="section"
          flush
          className="library-document-card"
          aria-labelledby="library-documents-title"
          aria-busy={isLoading}
        >
          <div className="library-document-header">
            <h2 className="visually-hidden" id="library-documents-title">문서 목록</h2>
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
          {!isLoading && !isError && !isEmpty ? <LibraryDocumentTable page={page} /> : null}

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

        <DemoControls state={state} onChooseMode={chooseMode} />

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
