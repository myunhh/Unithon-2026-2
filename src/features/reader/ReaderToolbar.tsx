import { Alert } from '../../components/Alert'
import { Button } from '../../components/Button'
import { Input } from '../../components/Input'
import { StatusBadge } from '../../components/StatusBadge'
import type { FileStatus, ParseStatus } from './reader-state'

const parseLabels = {
  queued: '파싱 대기',
  extracting: '원문 확인 중',
  ready: '원문 준비 완료',
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
      <header className="reader-toolbar">
        <Button variant="secondary" onClick={onBackToLibrary}>보관함으로 돌아가기</Button>
        <div className="reader-context">
          <span className="reader-context-label">{sourceLabel ?? '비공개 문서'}</span>
          <span className="reader-context-id">{documentId}</span>
        </div>
        <div className="reader-ready-group">
          {sourceLabel ? <span className="reader-source-label">상태 확인용</span> : null}
          <StatusBadge tone={fileReady && parseReady ? 'ready' : parseError ? 'error' : 'working'}>{fileReady && parseReady ? '준비 완료' : parseError ? '확인 필요' : '준비 중'}</StatusBadge>
          <span className="reader-parse-state" aria-live="polite">{parseLabels[parseStatus]}</span>
        </div>
      </header>
      <div className="reader-controls" aria-label="PDF 쪽과 확대/축소 조절">
        <div className="inline-actions">
          <Button variant="secondary" onClick={() => onPageChange(currentPage - 1)} disabled={currentPage <= 1}>이전 쪽</Button>
          <label className="reader-page-input">쪽 <Input aria-label="현재 쪽" type="number" min={1} max={pageCount} value={currentPage} onChange={(event) => onPageChange(Number(event.target.value))} /></label>
          <span className="reader-page-count">/ {pageCount}쪽</span>
          <Button variant="secondary" onClick={() => onPageChange(currentPage + 1)} disabled={currentPage >= pageCount}>다음 쪽</Button>
          <Button variant="secondary" aria-pressed={showAllPages} onClick={onToggleAllPages}>{showAllPages ? '현재 쪽만 보기' : '모든 쪽 보기'}</Button>
        </div>
        <div className="inline-actions">
          <Button variant="secondary" onClick={() => onZoomChange(zoom - 0.1)} disabled={zoom <= 0.6}>축소</Button>
          <span className="reader-zoom-value">{Math.round(zoom * 100)}%</span>
          <Button variant="secondary" onClick={() => onZoomChange(zoom + 0.1)} disabled={zoom >= 2.4}>확대</Button>
          <Button variant="secondary" onClick={() => onZoomChange(1.2)} disabled={zoom === 1.2}>기본값</Button>
        </div>
        {parseError ? <Alert tone="warning">{parseError} 원문은 준비된 범위에서 계속 확인할 수 있습니다.</Alert> : null}
      </div>
    </>
  )
}
