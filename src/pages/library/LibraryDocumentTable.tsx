import { StatusBadge } from '../../components/StatusBadge'
import type { LibraryDemoPage } from './demoFixtures'

type LibraryDocumentTableProps = {
  readonly page: LibraryDemoPage
}

export function LibraryDocumentTable({ page }: LibraryDocumentTableProps) {
  return (
    <div className="library-table-scroll" role="region" tabIndex={0} aria-label={`문서 목록 ${page.pageNumber}페이지 표`}>
      <table className="library-document-table">
        <caption className="visually-hidden">문서 목록 {page.pageNumber}페이지</caption>
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
          {page.items.map((document) => (
            <tr key={document.key}>
              <td><StatusBadge tone={document.statusTone}>{document.statusLabel}</StatusBadge></td>
              <th scope="row" className="library-document-title">{document.title}</th>
              <td className="library-document-number">{document.pageCount ?? '—'}</td>
              <td className="library-document-date">{document.lastOpened}</td>
              <td className="library-document-number">{document.highlightCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
