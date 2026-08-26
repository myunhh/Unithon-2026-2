import { StatusBadge } from '../../components/StatusBadge'
import type { LibraryDocument } from '../../domain/library'

type LibraryDocumentTableProps = {
  readonly documents: readonly LibraryDocument[]
  readonly onOpen: (documentId: string) => void
}

const parseStateLabel = {
  queued: '대기',
  uploading: '업로드 중',
  extracting: '추출 중',
  structuring: '구조화 중',
  ready: '완료',
  failed: '실패',
} as const

export function LibraryDocumentTable({ documents, onOpen }: LibraryDocumentTableProps) {
  return (
    <div className="library-table-scroll" role="region" tabIndex={0} aria-label="문서 목록 표">
      <table className="library-document-table">
        <caption className="visually-hidden">PaperBridge에 저장된 문서 목록</caption>
        <thead>
          <tr>
            <th scope="col">상태</th>
            <th scope="col">제목</th>
            <th scope="col">페이지</th>
            <th scope="col">마지막 열람</th>
            <th scope="col">하이라이트</th>
          </tr>
        </thead>
        <tbody>
          {documents.map((document) => (
            <tr key={document.id}>
              <td><StatusBadge tone={toneForParseState(document.parseState)}>{parseStateLabel[document.parseState]}</StatusBadge></td>
              <th scope="row" className="library-document-title"><button className="library-document-link" type="button" onClick={() => onOpen(document.id)}>{document.title}</button></th>
              <td className="library-document-number">{document.pageCount || '—'}</td>
              <td className="library-document-date">{formatDate(document.updatedAt)}</td>
              <td className="library-document-number">—</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function toneForParseState(state: LibraryDocument['parseState']): 'ready' | 'working' | 'error' {
  if (state === 'ready') return 'ready'
  if (state === 'failed') return 'error'
  return 'working'
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
}
