export type ProblemStatus = 400 | 401 | 403 | 404 | 409 | 410 | 412 | 413 | 415 | 422 | 429 | 500 | 502 | 503 | 504

export type ProblemDefinition = Readonly<{
  readonly type: string
  readonly title: string
  readonly status: ProblemStatus
  readonly retryable: boolean
}>

export const PROBLEM_REGISTRY = {
  invalid_request: {
    type: 'https://api.paperbridge.example/problems/invalid-request',
    title: 'Invalid request',
    status: 400,
    retryable: false,
  },
  authentication_required: {
    type: 'https://api.paperbridge.example/problems/authentication-required',
    title: 'Authentication required',
    status: 401,
    retryable: false,
  },
  authentication_failed: {
    type: 'https://api.paperbridge.example/problems/authentication-failed',
    title: 'Authentication failed',
    status: 401,
    retryable: false,
  },
  permission_denied: {
    type: 'https://api.paperbridge.example/problems/permission-denied',
    title: 'Permission denied',
    status: 403,
    retryable: false,
  },
  resource_not_found: {
    type: 'https://api.paperbridge.example/problems/resource-not-found',
    title: 'Resource not found',
    status: 404,
    retryable: false,
  },
  conflict: {
    type: 'https://api.paperbridge.example/problems/conflict',
    title: 'Conflict',
    status: 409,
    retryable: false,
  },
  run_cancelled: {
    type: 'https://api.paperbridge.example/problems/run-cancelled',
    title: 'Run cancelled',
    status: 409,
    retryable: false,
  },
  upload_expired: {
    type: 'https://api.paperbridge.example/problems/upload-expired',
    title: 'Upload expired',
    status: 410,
    retryable: false,
  },
  precondition_failed: {
    type: 'https://api.paperbridge.example/problems/precondition-failed',
    title: 'Precondition failed',
    status: 412,
    retryable: false,
  },
  payload_too_large: {
    type: 'https://api.paperbridge.example/problems/payload-too-large',
    title: 'Payload too large',
    status: 413,
    retryable: false,
  },
  output_limit_exceeded: {
    type: 'https://api.paperbridge.example/problems/output-limit-exceeded',
    title: 'Output limit exceeded',
    status: 413,
    retryable: false,
  },
  unsupported_media_type: {
    type: 'https://api.paperbridge.example/problems/unsupported-media-type',
    title: 'Unsupported media type',
    status: 415,
    retryable: false,
  },
  invalid_pdf: {
    type: 'https://api.paperbridge.example/problems/invalid-pdf',
    title: 'Invalid PDF',
    status: 422,
    retryable: false,
  },
  pdf_password_protected: {
    type: 'https://api.paperbridge.example/problems/pdf-password-protected',
    title: 'PDF is password protected',
    status: 422,
    retryable: false,
  },
  pdf_corrupted: {
    type: 'https://api.paperbridge.example/problems/pdf-corrupted',
    title: 'PDF is corrupted',
    status: 422,
    retryable: false,
  },
  checksum_mismatch: {
    type: 'https://api.paperbridge.example/problems/checksum-mismatch',
    title: 'Checksum mismatch',
    status: 422,
    retryable: false,
  },
  rate_limited: {
    type: 'https://api.paperbridge.example/problems/rate-limited',
    title: 'Too many requests',
    status: 429,
    retryable: true,
  },
  budget_exceeded: {
    type: 'https://api.paperbridge.example/problems/budget-exceeded',
    title: 'Budget exceeded',
    status: 429,
    retryable: false,
  },
  run_limit_exceeded: {
    type: 'https://api.paperbridge.example/problems/run-limit-exceeded',
    title: 'Run limit exceeded',
    status: 429,
    retryable: true,
  },
  internal_error: {
    type: 'https://api.paperbridge.example/problems/internal-error',
    title: 'Internal server error',
    status: 500,
    retryable: false,
  },
  provider_authentication_failed: {
    type: 'https://api.paperbridge.example/problems/provider-authentication-failed',
    title: 'Provider authentication failed',
    status: 502,
    retryable: false,
  },
  provider_protocol_error: {
    type: 'https://api.paperbridge.example/problems/provider-protocol-error',
    title: 'Provider response was invalid',
    status: 502,
    retryable: true,
  },
  service_unavailable: {
    type: 'https://api.paperbridge.example/problems/service-unavailable',
    title: 'Service unavailable',
    status: 503,
    retryable: true,
  },
  provider_not_configured: {
    type: 'https://api.paperbridge.example/problems/provider-not-configured',
    title: 'Provider is not configured',
    status: 503,
    retryable: false,
  },
  provider_unavailable: {
    type: 'https://api.paperbridge.example/problems/provider-unavailable',
    title: 'Provider unavailable',
    status: 503,
    retryable: true,
  },
  model_not_available: {
    type: 'https://api.paperbridge.example/problems/model-not-available',
    title: 'Model unavailable',
    status: 503,
    retryable: false,
  },
  parse_not_ready: {
    type: 'https://api.paperbridge.example/problems/parse-not-ready',
    title: 'Document is not ready',
    status: 503,
    retryable: true,
  },
  parse_failed: {
    type: 'https://api.paperbridge.example/problems/parse-failed',
    title: 'Document parsing failed',
    status: 422,
    retryable: true,
  },
  run_timeout: {
    type: 'https://api.paperbridge.example/problems/run-timeout',
    title: 'Run timed out',
    status: 504,
    retryable: true,
  },
  evidence_not_found: {
    type: 'https://api.paperbridge.example/problems/evidence-not-found',
    title: 'Evidence not found',
    status: 404,
    retryable: false,
  },
} as const satisfies Readonly<Record<string, ProblemDefinition>>

export const PROBLEM_DEFINITIONS = PROBLEM_REGISTRY

export type ProblemCode = keyof typeof PROBLEM_REGISTRY

export type ProblemFieldError = Readonly<{
  readonly path: string
  readonly code: string
  readonly message?: string
}>

export type ProblemMeta = Readonly<Record<string, unknown>>

export type ProblemErrorOptions = Readonly<{
  readonly detail?: string
  readonly retryable?: boolean
  readonly errors?: readonly ProblemFieldError[]
  readonly meta?: ProblemMeta
  readonly cause?: unknown
}>

export type ProblemErrorInput = Readonly<{
  readonly code: ProblemCode
}> & ProblemErrorOptions

export class ProblemError extends Error {
  readonly name = 'ProblemError'
  readonly code: ProblemCode
  readonly retryable: boolean
  readonly detail?: string
  readonly errors?: readonly ProblemFieldError[]
  readonly meta?: ProblemMeta

  constructor(input: ProblemErrorInput)
  constructor(code: ProblemCode, options?: ProblemErrorOptions)
  constructor(inputOrCode: ProblemErrorInput | ProblemCode, options: ProblemErrorOptions = {}) {
    const input =
      typeof inputOrCode === 'string'
        ? { ...options, code: inputOrCode }
        : inputOrCode
    const definition = PROBLEM_REGISTRY[input.code]
    super(definition.title, input.cause === undefined ? undefined : { cause: input.cause })
    this.code = input.code
    this.retryable = input.retryable ?? definition.retryable
    if (input.detail !== undefined) this.detail = input.detail
    if (input.errors !== undefined) this.errors = input.errors
    if (input.meta !== undefined) this.meta = input.meta
  }
}

export { ProblemError as DomainError }
