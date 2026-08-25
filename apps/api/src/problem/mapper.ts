import {
  ProblemError,
  PROBLEM_REGISTRY,
} from './registry.js'
import {
  normalizeRequestId,
  sanitizeProblemDetail,
  sanitizeProblemErrors,
  sanitizeProblemMeta,
} from './redaction.js'
import type { ProblemDetails, ProblemResponse } from './types.js'

function internalProblem(requestId: string): ProblemDetails {
  const definition = PROBLEM_REGISTRY.internal_error
  return {
    type: definition.type,
    title: definition.title,
    status: definition.status,
    code: 'internal_error',
    requestId,
  }
}

export function mapErrorToProblem(cause: unknown, requestId: string): ProblemDetails {
  const normalizedRequestId = normalizeRequestId(requestId)
  if (!(cause instanceof ProblemError)) return internalProblem(normalizedRequestId)

  const definition = PROBLEM_REGISTRY[cause.code]
  const detail = sanitizeProblemDetail(cause.detail)
  const errors = sanitizeProblemErrors(cause.errors)
  const meta = sanitizeProblemMeta(cause.meta)
  return {
    type: definition.type,
    title: definition.title,
    status: definition.status,
    code: cause.code,
    requestId: normalizedRequestId,
    retryable: cause.retryable,
    ...(detail === undefined ? {} : { detail }),
    ...(errors === undefined ? {} : { errors }),
    ...(meta === undefined ? {} : { meta }),
  }
}

export function toProblemResponse(cause: unknown, requestId: string): ProblemResponse {
  const body = mapErrorToProblem(cause, requestId)
  return {
    status: body.status,
    headers: {
      'content-type': 'application/problem+json',
    },
    body,
  }
}

export const mapDomainErrorToProblem = mapErrorToProblem
export const mapProblemError = mapErrorToProblem
export const toProblemDetails = mapErrorToProblem
export const createProblemResponse = toProblemResponse
