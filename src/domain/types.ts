/** Opaque IDs are strings at the transport boundary and are named here for intent. */
export type DocumentId = string
export type ProviderId = string
export type AgentRequestId = string

export type ParseState =
  | 'queued'
  | 'uploading'
  | 'extracting'
  | 'structuring'
  | 'ready'
  | 'failed'

export type Document = {
  id: DocumentId
  title: string
  originalFileName: string
  mimeType: 'application/pdf'
  source: 'upload' | 'import'
  createdAt: string
  updatedAt: string
  lastOpenedAt?: string
  pageCount?: number
  highlightCount: number
  parseState: ParseState
  failure?: ParseFailure
}

export type ParseFailure = {
  code: string
  message: string
  failedAt: string
  retryable: boolean
}

/** A rectangle relative to a PDF page; every coordinate is in the inclusive 0–1 range. */
export type NormRect = {
  x: number
  y: number
  width: number
  height: number
}

export type TextRange = {
  startItemId: string
  startOffset: number
  endItemId: string
  endOffset: number
}

export type SelectionAnchor = {
  documentId: DocumentId
  pageNumber: number
  rects: readonly NormRect[]
  textRange?: TextRange
  selectedText?: string
}

export type TextItem = {
  id: string
  text: string
  bounds: NormRect
  fontName?: string
  fontSize?: number
  direction: 'ltr' | 'rtl' | 'ttb'
  order: number
}

export type Line = {
  id: string
  itemIds: readonly string[]
  bounds: NormRect
  text: string
  order: number
}

export type Block = {
  id: string
  lineIds: readonly string[]
  bounds: NormRect
  text: string
  order: number
  role: 'heading' | 'paragraph' | 'caption' | 'table' | 'list' | 'unknown'
}

export type Page = {
  id: string
  pageNumber: number
  width: number
  height: number
  rotation: 0 | 90 | 180 | 270
  textItems: readonly TextItem[]
  lines: readonly Line[]
  blocks: readonly Block[]
}

export type PdfObjectGraph = {
  documentId: DocumentId
  version: 1
  pages: readonly Page[]
  createdAt: string
}

export type ProviderCapability =
  | 'explain-selection'
  | 'translate-selection'
  | 'translate-page'
  | 'summarize-document'
  | 'document-chat'

export type Provider = {
  id: ProviderId
  kind: 'remote-api' | 'desktop-cli'
  displayName: string
  capabilities: readonly ProviderCapability[]
  status: 'unconfigured' | 'checking' | 'ready' | 'limited' | 'unavailable'
  isAvailableInCurrentShell: boolean
}

export type AgentOperation = ProviderCapability

export type AgentRequest = {
  id: AgentRequestId
  documentId: DocumentId
  providerId: ProviderId
  operation: AgentOperation
  requestedAt: string
  prompt?: string
  selection?: SelectionAnchor
  pageNumber?: number
}

export type AgentError = {
  code: string
  message: string
  retryable: boolean
  cause?: string
}

export type AgentEvent =
  | { type: 'queued'; requestId: AgentRequestId; occurredAt: string }
  | { type: 'started'; requestId: AgentRequestId; occurredAt: string }
  | { type: 'delta'; requestId: AgentRequestId; occurredAt: string; text: string }
  | { type: 'completed'; requestId: AgentRequestId; occurredAt: string; result: AgentResult }
  | { type: 'failed'; requestId: AgentRequestId; occurredAt: string; error: AgentError }

export type AgentResult = {
  text: string
  citedBlockIds: readonly string[]
  providerMetadata?: Record<string, string | number | boolean>
}

/** Gateway implementations live outside the UI and can stream without coupling to a provider SDK. */
export interface Gateway {
  listProviders(): Promise<readonly Provider[]>
  request(request: AgentRequest): AsyncIterable<AgentEvent>
}
