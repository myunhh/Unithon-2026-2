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
    <section className="selection-toolbar" aria-label="선택한 텍스트 작업">
      <span><strong>{selection.selectedText || '선택한 영역'}</strong> · {selection.pageNumber}쪽에서 선택됨. 다음 작업을 고르세요.</span>
      <div className="inline-actions">
        <Button variant="secondary" onClick={() => onRun('explain')} disabled={busy}>{run.task === 'explain' && run.status === 'running' ? '설명 실행 중…' : '설명 시작'}</Button>
        <Button variant="secondary" onClick={() => onRun('translate')} disabled={busy}>{run.task === 'translate' && run.status === 'running' ? '번역 실행 중…' : '번역 시작'}</Button>
        <Button onClick={onSaveHighlight} disabled={savingHighlight}>{savingHighlight ? '저장 중…' : '하이라이트 저장'}</Button>
        <Button variant="secondary" onClick={onDismiss}>선택 닫기</Button>
      </div>
    </section>
  )
}
