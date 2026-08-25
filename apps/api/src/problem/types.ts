import type {
  ProblemCode,
  ProblemFieldError,
  ProblemMeta,
  ProblemStatus,
} from './registry.js'

export type ProblemDetails = Readonly<{
  readonly type: string
  readonly title: string
  readonly status: ProblemStatus
  readonly code: ProblemCode
  readonly requestId: string
  readonly detail?: string
  readonly instance?: string
  readonly retryable?: boolean
  readonly errors?: readonly ProblemFieldError[]
  readonly meta?: ProblemMeta
}>

export type ProblemResponse = Readonly<{
  readonly status: ProblemStatus
  readonly headers: Readonly<{
    readonly 'content-type': 'application/problem+json'
  }>
  readonly body: ProblemDetails
}>
