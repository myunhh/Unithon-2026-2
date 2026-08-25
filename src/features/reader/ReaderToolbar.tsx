import { Alert } from '../../components/Alert'
import { Button } from '../../components/Button'
import { Input } from '../../components/Input'
import { StatusBadge } from '../../components/StatusBadge'
import type { FileStatus, ParseStatus } from './reader-state'

const parseLabels = {
  queued: '파싱 대기',
  extracting: '원문 확인 중',
  ready: '준비 완료',
  error: '원문 확인 실패',
} as const satisfies Record<ParseStatus, string>

export type ReaderToolbarProps = {
  readonly documentId: string
  readonly pageCount: number
  readonly currentPage: number
  readonly zoom: number
  readonly showAllPages: boolean
  readonly fileStatus: FileStatus
  readonly parseStatus: ParseStatus
  readonly parseError: string | null
  readonly sourceLabel: string | null
  readonly onBackToLibrary: () => void
  readonly onPageChange: (page: number) => void
  readonly onZoomChange: (zoom: number) => void
  readonly onToggleAllPages: () => void
}

export function ReaderToolbar({ documentId, pageCount, currentPage, zoom, showAllPages, fileStatus, parseStatus, parseError, sourceLabel, onBackToLibrary, onPageChange, onZoomChange, onToggleAllPages }: ReaderToolbarProps) {
  const fileReady = fileStatus === 'ready'
  const parseReady = parseStatus === 'ready'
  return (
    <>
      <header className="reader-toolbar" role="toolbar" aria-label="문서 도구">
        <h1 className="visually-hidden">PDF 리더: {documentId}</h1>
        <Button className="reader-back-button" variant="secondary" onClick={onBackToLibrary}>← 보관함</Button>
        <div className="reader-context">
          <span className="reader-context-label">PaperPilot · 문서 리더</span>
          <strong className="reader-context-id">{sourceLabel ?? '비공개 문서'}</strong>
        </div>
        <div className="reader-ready-group">
          <span className="reader-source-label">{documentId}</span>
          <StatusBadge tone={fileReady && parseReady ? 'ready' : parseError ? 'error' : 'working'}>{fileReady && parseReady ? '준비 완료' : parseError ? '확인 필요' : '진행 중'}</StatusBadge>
          <span className="reader-parse-state" aria-live="polite">{parseLabels[parseStatus]}</span>
        </div>
      </header>
      <div className="reader-controls" role="group" aria-label="PDF 쪽과 확대/축소 조절">
        <div className="reader-control-group reader-control-group--page">
          <span className="reader-control-label">페이지</span>
          <Button className="reader-step-button" variant="secondary" aria-label="이전 페이지" onClick={() => onPageChange(currentPage - 1)} disabled={currentPage <= 1}><span aria-hidden="true">−</span></Button>
          <label className="reader-page-input"><span className="visually-hidden">현재 페이지</span><Input aria-label="현재 페이지" type="number" min={1} max={pageCount} value={currentPage} onChange={(event) => onPageChange(Number(event.target.value))} /></label>
          <span className="reader-page-count">/ {pageCount}</span>
          <Button className="reader-step-button" variant="secondary" aria-label="다음 페이지" onClick={() => onPageChange(currentPage + 1)} disabled={currentPage >= pageCount}>＋</Button>
        </div>
        <div className="reader-control-group reader-control-group--zoom">
          <span className="reader-control-label">확대</span>
          <Button className="reader-step-button" variant="secondary" aria-label="축소" onClick={() => onZoomChange(zoom - 0.1)} disabled={zoom <= 0.6}><span aria-hidden="true">−</span></Button>
          <output className="reader-zoom-value" aria-label="현재 확대율">{Math.round(zoom * 100)}%</output>
          <Button className="reader-step-button" variant="secondary" aria-label="확대" onClick={() => onZoomChange(zoom + 0.1)} disabled={zoom >= 2.4}>＋</Button>
          <Button className="reader-fit-button" variant="secondary" onClick={() => onZoomChange(1.2)} disabled={zoom === 1.2}>폭 맞춤</Button>
        </div>
        <Button className="reader-view-button" variant="secondary" aria-pressed={showAllPages} onClick={onToggleAllPages}>{showAllPages ? '현재 페이지만' : '전체 페이지'}</Button>
        {parseError ? <Alert tone="warning">{parseError} 원문은 준비된 범위에서 계속 확인할 수 있습니다.</Alert> : null}
      </div>
    </>
  )
}
