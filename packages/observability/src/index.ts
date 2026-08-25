export const packageSurface = {
  name: '@paperbridge/observability',
  entrypoint: 'library',
} as const

export {
  createCorrelationContext,
  createRequestContext,
  InvalidCorrelationIdError,
  sanitizeCorrelationIds,
} from './correlation.js'
export { CORRELATION_KINDS, LOG_LEVELS } from './types.js'
export {
  createObservability,
  InvalidObservabilityLabelError,
  InvalidObservabilityTimestampError,
  ObservabilityCore,
} from './observability.js'
export { REDACTED_VALUE, sanitizeFields } from './redaction.js'
export { createDeterministicSink, createTestSink, DeterministicEventSink } from './sink.js'
export type {
  CorrelationContext,
  CorrelationContextOptions,
  CorrelationIdFactory,
  CorrelationIds,
  CorrelationKind,
  CorrelationSeed,
  EventInput,
  EventSink,
  LogLevel,
  MetricInput,
  Observability,
  ObservabilityOptions,
  SafeFieldValue,
  SafeFields,
  StructuredEvent,
} from './types.js'
