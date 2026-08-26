import { useEffect, useState, type ChangeEvent, type DragEvent, type FormEvent } from 'react'
import { Alert } from '../components/Alert'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { PageHeader } from '../components/PageHeader'
import { Stat } from '../components/Stat'
import { listLibraryDocuments, uploadLibraryDocument, type LibraryDocument } from '../domain/library'
import { LibraryDocumentTable } from './library/LibraryDocumentTable'
import './LibraryPage.css'

type LibraryPageProps = {
  onNavigate: (path: string) => void
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

export function LibraryPage({ onNavigate }: LibraryPageProps) {
  const [documents, setDocuments] = useState<readonly LibraryDocument[]>([])
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    void loadDocuments(controller.signal)
    return () => controller.abort()
  }, [])

  async function loadDocuments(signal?: AbortSignal): Promise<void> {
    setLoading(true)
    setError(null)
    try {
      setDocuments(await listLibraryDocuments(signal))
    } catch (requestError) {
      if ((requestError as DOMException).name !== 'AbortError') {
        setError(requestError instanceof Error ? requestError.message : '문서 목록을 불러오지 못했습니다.')
      }
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }

  function chooseFile(file: File | null): void {
    setMessage(null)
    setError(null)
    if (!file) {
      setSelectedFile(null)
      return
    }
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setSelectedFile(null)
      setError('PDF 파일만 업로드할 수 있습니다.')
      return
    }
    setSelectedFile(file)
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>): void {
    chooseFile(event.target.files?.[0] ?? null)
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>): void {
    event.preventDefault()
    chooseFile(event.dataTransfer.files[0] ?? null)
  }

  async function handleUpload(event: FormEvent<HTMLElement>): Promise<void> {
    event.preventDefault()
    if (!selectedFile || uploading) return
    setUploading(true)
    setProgress(0)
    setError(null)
    setMessage(null)
    try {
      const document = await uploadLibraryDocument(selectedFile, '', setProgress)
      setDocuments((current) => [document, ...current.filter((candidate) => candidate.id !== document.id)])
      setSelectedFile(null)
      setProgress(100)
      setMessage(`${document.title} 업로드를 완료했습니다.`)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'PDF를 업로드하지 못했습니다.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <section className="page library-page">
      <PageHeader
        title="라이브러리"
        description="업로드한 논문을 다시 엽니다."
      />

      <div className="library-page-stack">
        <section className="library-upload-layout" aria-label="문서 업로드와 보관함 요약">
          <Card as="form" className="library-upload-card" aria-label="문서 업로드" onSubmit={(event) => void handleUpload(event)}>
            <div className="library-upload-field">
              <span className="library-field-label" id="library-pdf-label">PDF 파일</span>
              <div className="library-upload-row">
                <label className="library-file-dropzone" htmlFor="library-pdf-file" onDragOver={(event) => event.preventDefault()} onDrop={handleDrop}>
                  <span className="library-file-name">{selectedFile?.name ?? '파일을 선택하거나 여기로 끌어다 놓으세요'}</span>
                  <span className="library-file-copy">PDF · 최대 50MB</span>
                </label>
                <Button className="library-upload-button" type="submit" disabled={!selectedFile || uploading}>{uploading ? `${progress}%` : '업로드'}</Button>
              </div>
              <input
                className="visually-hidden"
                id="library-pdf-file"
                type="file"
                accept="application/pdf"
                disabled={uploading}
                onChange={handleFileChange}
                aria-labelledby="library-pdf-label"
                aria-describedby="library-pdf-help"
              />
              <p className="library-upload-help" id="library-pdf-help">업로드한 논문은 비공개로 보관됩니다.</p>
              {uploading ? <p className="library-upload-boundary" role="status" aria-live="polite">서버에 업로드하는 중 · {progress}%</p> : null}
            </div>
          </Card>
          <Card as="section" className="library-saved-card" aria-label="보관함 요약">
            <Stat label="저장된 논문" value={loading ? '—' : documents.length} description="비공개 PDF 기록" />
          </Card>
        </section>

        {message ? <Alert tone="success" className="library-document-alert">{message}</Alert> : null}

        <Card
          as="section"
          flush
          className="library-document-card"
          aria-labelledby="library-documents-title"
          aria-busy={loading}
        >
          <div className="library-document-header">
            <h2 className="visually-hidden" id="library-documents-title">문서 목록</h2>
            <div className="library-page-indicator" role="group" aria-label="문서 수"><span>문서</span><strong>{loading ? '—' : documents.length}</strong></div>
          </div>

          {loading ? <LoadingState /> : null}
          {error ? (
            <Alert className="library-document-alert" tone="error">
              <span><strong>요청을 완료하지 못했습니다.</strong> {error}</span>
              <Button variant="secondary" onClick={() => void loadDocuments()}>목록 다시 불러오기</Button>
            </Alert>
          ) : null}
          <LibraryDocumentTable documents={documents} onOpen={(documentId) => onNavigate(`/reader/${encodeURIComponent(documentId)}`)} />
          {!loading && !error && documents.length === 0 ? <EmptyState /> : null}
        </Card>

        <div className="library-demo-stats" role="group" aria-label="문서 보관함 요약">
          <Stat label="현재 문서" value={loading ? '—' : documents.length} description="API에서 불러온 문서" />
          <Stat label="읽기 가능" value={loading ? '—' : documents.filter((document) => document.parseState === 'ready').length} description="처리가 완료된 PDF" />
          <Stat label="처리 중" value={loading ? '—' : documents.filter((document) => document.parseState !== 'ready' && document.parseState !== 'failed').length} description="업로드 또는 분석 중" />
        </div>
      </div>

      <p className="visually-hidden" role="status" aria-live="polite">{message ?? (loading ? '문서 목록을 불러오는 중입니다.' : `${documents.length}개의 문서를 불러왔습니다.`)}</p>
    </section>
  )
}
