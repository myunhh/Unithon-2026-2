import { Button } from '../../components/Button'
import type { SelectionAnchor } from '../../domain/types'
import type { AgentTask, ReaderRunState } from './reader-state'

export type SelectionToolbarProps = {
  readonly selection: SelectionAnchor | null
  readonly run: ReaderRunState
  readonly savingHighlight: boolean
  readonly onRun: (task: AgentTask) => void
  readonly onSaveHighlight: () => void
  readonly onDismiss: () => void
}

export function SelectionToolbar({ selection, run, savingHighlight, onRun, onSaveHighlight, onDismiss }: SelectionToolbarProps) {
  if (!selection) return null
  const busy = run.status === 'checking-provider' || run.status === 'running'
  return (
    <section className="selection-toolbar" aria-label="선택한 텍스트 작업" role="toolbar">
      <div className="selection-toolbar-summary">
        <span className="selection-toolbar-kicker">텍스트 선택됨</span>
        <strong>{selection.pageNumber}쪽</strong>
        <span className="selection-toolbar-preview">{selection.selectedText || '선택한 영역'}</span>
      </div>
      <div className="inline-actions selection-toolbar-actions">
        <Button variant="secondary" onClick={() => onRun('explain')} disabled={busy}>{run.task === 'explain' && run.status === 'running' ? '설명 중…' : '설명'}</Button>
        <Button variant="secondary" onClick={() => onRun('translate')} disabled={busy}>{run.task === 'translate' && run.status === 'running' ? '번역 중…' : '번역'}</Button>
        <Button variant="secondary" onClick={onSaveHighlight} disabled={savingHighlight}>{savingHighlight ? '저장 중…' : '하이라이트'}</Button>
        <Button variant="secondary" onClick={onDismiss}>닫기</Button>
      </div>
    </section>
  )
}
