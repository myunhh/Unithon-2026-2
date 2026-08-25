import { useEffect, useState, type ChangeEvent, type DragEvent } from 'react'
import { Alert } from '../components/Alert'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { EmptyRow } from '../components/EmptyRow'
import { Field } from '../components/Field'
import { Input } from '../components/Input'
import { PageHeader } from '../components/PageHeader'
import { Stat } from '../components/Stat'
import { StatusBadge } from '../components/StatusBadge'
import { AppLink } from '../routes/AppLink'
import {
  listLibraryDocuments,
  uploadLibraryDocument,
  type LibraryDocument,
} from '../domain/library'

const MAX_PDF_BYTES = 50 * 1024 * 1024

type LibraryPageProps = {
  onNavigate: (path: string) => void
}

function formatBytes(size: number): string {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`
  return `${(size / (1024 * 1024)).toFixed(size >= 10 * 1024 * 1024 ? 0 : 1)} MB`
}

function formatDate(timestamp: string): string {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return '날짜 없음'
  return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function stateLabel(state: LibraryDocument['parseState']) {
  if (state === 'ready') return { label: '읽을 수 있음', tone: 'ready' as const }
  if (state === 'failed') return { label: '처리 실패', tone: 'error' as const }
  if (state === 'queued') return { label: '처리 대기 중', tone: 'working' as const }
  if (state === 'uploading') return { label: '업로드 중', tone: 'working' as const }
  return { label: '문서 분석 중', tone: 'working' as const }
}

async function validateSelectedFile(file: File): Promise<string | null> {
  if (file.type !== 'application/pdf') return 'PDF 형식의 파일만 선택할 수 있습니다.'
  if (file.size > MAX_PDF_BYTES) return 'PDF 파일은 50MB 이하만 업로드할 수 있습니다.'

  const bytes = new Uint8Array(await file.slice(0, 5).arrayBuffer())
  if (bytes.length < 5 || bytes[0] !== 0x25 || bytes[1] !== 0x50 || bytes[2] !== 0x44 || bytes[3] !== 0x46 || bytes[4] !== 0x2d) {
    return '선택한 파일이 올바른 PDF인지 확인할 수 없습니다.'
  }
  return null
}

export function LibraryPage({ onNavigate }: LibraryPageProps) {
  const [documents, setDocuments] = useState<LibraryDocument[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [selectionError, setSelectionError] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadedDocument, setUploadedDocument] = useState<LibraryDocument | null>(null)
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  const refreshDocuments = async () => {
    setIsLoading(true)
    setLoadError(null)
    try {
      setDocuments(await listLibraryDocuments())
    } catch {
      setLoadError('문서 보관함을 불러오지 못했습니다. 연결과 로그인 상태를 확인한 뒤 다시 시도하세요.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    const controller = new AbortController()
    let current = true
    const loadInitialDocuments = async () => {
      try {
        const initialDocuments = await listLibraryDocuments(controller.signal)
        if (current) setDocuments(initialDocuments)
      } catch (error) {
        if (current && (error as DOMException).name !== 'AbortError') {
          setLoadError('문서 보관함을 불러오지 못했습니다. 연결과 로그인 상태를 확인한 뒤 다시 시도하세요.')
        }
      } finally {
        if (current) setIsLoading(false)
      }
    }
    void loadInitialDocuments()
    return () => {
      current = false
      controller.abort()
    }
  }, [])

  const chooseFile = async (file: File | undefined) => {
    setSelectionError(null)
    setUploadError(null)
    setUploadedDocument(null)
    if (!file) return

    let error: string | null
    try {
      error = await validateSelectedFile(file)
    } catch {
      setSelectedFile(null)
      setSelectionError('선택한 PDF를 읽지 못했습니다. 파일을 다시 선택해 주세요.')
      return
    }
    if (error) {
      setSelectedFile(null)
      setSelectionError(error)
      return
    }

    setSelectedFile(file)
    if (!title.trim()) setTitle(file.name.replace(/\.pdf$/i, ''))
  }

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    void chooseFile(event.target.files?.[0])
    event.target.value = ''
  }

  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault()
    setIsDragging(false)
    const files = event.dataTransfer.files
    if (files.length !== 1) {
      setSelectedFile(null)
      setSelectionError('한 번에 PDF 파일 하나만 놓아 주세요.')
      return
    }
    void chooseFile(files[0])
  }

  const upload = async () => {
    if (!selectedFile || uploadProgress !== null) return
    setUploadError(null)
    setUploadedDocument(null)
    setUploadProgress(0)
    try {
      const document = await uploadLibraryDocument(selectedFile, title, setUploadProgress)
      setDocuments((current) => [document, ...current.filter((item) => item.id !== document.id)])
      setSelectedFile(null)
      setTitle('')
      setUploadedDocument(document)
      setUploadProgress(null)
    } catch {
      setUploadProgress(null)
      setUploadError('이 PDF를 업로드하지 못했습니다.')
    }
  }

  const uploadInProgress = uploadProgress !== null
  const readyDocumentCount = documents.filter((document) => document.parseState === 'ready').length

  return (
    <section className="page">
      <PageHeader
        title="문서 보관함"
        description="PDF를 업로드하고 처리 상태를 확인한 뒤, 같은 작업 공간에서 원문을 여세요."
      />

      <div className="page-stack">
        <section className="library-grid" aria-label="문서 업로드와 보관함 요약">
          <Card as="form" className="upload-card" onSubmit={(event) => {
            event.preventDefault()
            void upload()
          }}>
            <div className="card-heading">
              <div>
                <h2 className="card-title">PDF 추가</h2>
                <p className="card-description">파일은 비공개로 저장된 뒤 문서 분석 대기열에 들어갑니다.</p>
              </div>
              <StatusBadge tone={selectedFile ? 'ready' : 'warning'}>{selectedFile ? '파일 선택됨' : '파일을 선택하세요'}</StatusBadge>
            </div>

            <div className="upload-fields">
              <Field htmlFor="document-title" label="문서 제목" optional>
                <Input
                  id="document-title"
                  value={title}
                  maxLength={240}
                  onChange={(event) => setTitle(event.target.value)}
                  disabled={uploadInProgress}
                />
              </Field>

              <Field
                label="PDF 파일"
                help="PDF만 가능하며 최대 50MB까지 업로드할 수 있습니다."
                helpId="pdf-file-help"
                error={selectionError}
                errorId="file-selection-error"
              >
                <label
                  className="file-dropzone"
                  data-dragging={isDragging}
                  htmlFor="pdf-file"
                  onDragEnter={(event) => {
                    event.preventDefault()
                    setIsDragging(true)
                  }}
                  onDragOver={(event) => event.preventDefault()}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={onDrop}
                >
                  <span className="file-dropzone-title">{selectedFile ? selectedFile.name : '업로드할 PDF를 선택하세요'}</span>
                  <span className="file-dropzone-copy">
                    {selectedFile ? `${formatBytes(selectedFile.size)} · 업로드 준비됨` : '파일을 여기에 놓거나 파일 선택기를 사용하세요.'}
                  </span>
                  <Input
                    className="visually-hidden"
                    id="pdf-file"
                    type="file"
                    accept="application/pdf"
                    aria-describedby={selectionError ? 'file-selection-error' : 'pdf-file-help'}
                    onChange={onFileChange}
                    disabled={uploadInProgress}
                  />
                </label>
              </Field>
            </div>

            <div className="form-actions">
              <Button type="submit" disabled={!selectedFile || uploadInProgress}>
                {uploadInProgress ? '업로드 중…' : 'PDF 업로드'}
              </Button>
            </div>
          </Card>

          <Card as="aside" className="library-summary" aria-label="보관함 요약">
            <div className="card-heading">
              <div>
                <h2 className="card-title">보관함 상태</h2>
                <p className="card-description">현재 문서 처리 상태입니다.</p>
              </div>
            </div>
            <div className="stat-grid">
              <Stat label="저장된 문서" value={documents.length} description="비공개 PDF 기록" />
              <Stat label="읽을 수 있는 문서" value={readyDocumentCount} description="문서 분석 완료" />
            </div>
          </Card>
        </section>

        {uploadInProgress ? (
          <Card className="workflow-card" role="status" aria-live="polite">
            <div className="workflow-heading">
              <div>
                <h2 className="card-title">업로드 진행 중</h2>
                <p className="card-description">선택한 파일을 전송하고 있습니다. 문서 기록이 생성될 때까지 이 페이지를 열어 두세요.</p>
              </div>
              <StatusBadge tone="working">진행 중</StatusBadge>
            </div>
            <ol className="workflow-steps">
              <li data-state="complete"><span className="step-number">1</span><span>파일 선택</span><StatusBadge tone="ready">완료</StatusBadge></li>
              <li data-state="current"><span className="step-number">2</span><span>파일 전송</span><StatusBadge tone="working">진행 중</StatusBadge></li>
              <li data-state="pending"><span className="step-number">3</span><span>문서 분석 대기열 등록</span><span className="step-status">대기</span></li>
            </ol>
          </Card>
        ) : null}
        {uploadedDocument ? (
          <Alert tone="success">
            <span><strong>업로드 완료.</strong> {uploadedDocument.title}이(가) 비공개 보관함에 추가되었습니다. 다음 단계로 리더에서 문서를 여세요.</span>
            <AppLink className="button button--secondary" href={`/reader/${encodeURIComponent(uploadedDocument.id)}`} onNavigate={onNavigate}>리더에서 열기</AppLink>
          </Alert>
        ) : null}
        {uploadError ? (
          <Alert tone="error">
            <span><strong>업로드가 끝나지 않았습니다.</strong> {uploadError} 암호화되지 않은 50MB 이하의 PDF인지 확인한 뒤 다시 시도하세요.</span>
          </Alert>
        ) : null}

        <Card as="section" flush className="document-list" aria-labelledby="documents-title" aria-busy={isLoading}>
          <div className="document-list-header">
            <div>
                <h2 className="card-title" id="documents-title">문서 목록</h2>
                <p className="card-description">원본 파일과 현재 분석 상태입니다.</p>
            </div>
            <Button variant="secondary" onClick={() => void refreshDocuments()} disabled={isLoading}>{isLoading ? '불러오는 중…' : '새로고침'}</Button>
          </div>

          {isLoading ? <EmptyRow role="status">문서를 불러오는 중…</EmptyRow> : null}
          {loadError && !isLoading ? (
            <Alert className="document-list-alert" tone="error">
              <span>{loadError}</span>
              <Button variant="secondary" onClick={() => void refreshDocuments()}>다시 시도</Button>
            </Alert>
          ) : null}
          {!isLoading && !loadError && documents.length === 0 ? <EmptyRow>아직 업로드한 문서가 없습니다. 위에서 PDF를 추가해 보세요.</EmptyRow> : null}
          {!isLoading && !loadError && documents.map((document) => {
            const state = stateLabel(document.parseState)
            return (
              <article className="document-row" key={document.id}>
                <div className="document-summary">
                  <span className="document-name">{document.title}</span>
                  <span className="document-meta">
                    {document.originalFileName} · {formatBytes(document.sizeBytes)} · {document.pageCount > 0 ? `${document.pageCount}쪽` : '쪽 수 확인 중'} · 마지막 수정 {formatDate(document.updatedAt)}
                  </span>
                </div>
                <div className="document-actions">
                  <StatusBadge tone={state.tone}>{state.label}</StatusBadge>
                  <AppLink className="button button--secondary document-open-link" href={`/reader/${encodeURIComponent(document.id)}`} onNavigate={onNavigate}>리더에서 열기</AppLink>
                </div>
              </article>
            )
          })}
        </Card>
      </div>
    </section>
  )
}
