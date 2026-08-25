export const CORRELATION_KINDS = ['request', 'trace', 'run', 'job'] as const

export type CorrelationKind = (typeof CORRELATION_KINDS)[number]

export type CorrelationIds = Readonly<{
  readonly requestId?: string
  readonly traceId?: string
  readonly runId?: string
  readonly jobId?: string
}>

export type CorrelationSeed = CorrelationIds

export type CorrelationIdFactory = (kind: CorrelationKind) => string

export type CorrelationContext = Readonly<{
  readonly ids: CorrelationIds
  readonly child: (kind: CorrelationKind, id?: string) => CorrelationContext
  readonly withRequest: (id?: string) => CorrelationContext
  readonly withTrace: (id?: string) => CorrelationContext
  readonly withRun: (id?: string) => CorrelationContext
  readonly withJob: (id?: string) => CorrelationContext
}>

export type CorrelationContextOptions = Readonly<{
  readonly createId?: CorrelationIdFactory
}>

export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const

export type LogLevel = (typeof LOG_LEVELS)[number]

export type SafeFieldValue =
  | string
  | number
  | boolean
  | null
  | readonly SafeFieldValue[]
  | Readonly<{ readonly [key: string]: SafeFieldValue }>

export type SafeFields = Readonly<Record<string, SafeFieldValue>>

export type EventInput = Readonly<{
  readonly context?: CorrelationContext | CorrelationIds
  readonly event: string
  readonly level: LogLevel
  readonly fields?: Readonly<Record<string, unknown>>
}>

export type MetricInput = Readonly<{
  readonly context?: CorrelationContext | CorrelationIds
  readonly name: string
  readonly value: number
  readonly unit?: string
  readonly fields?: Readonly<Record<string, unknown>>
}>

export type StructuredEvent = Readonly<{
  readonly timestamp: string
  readonly level: LogLevel
  readonly service: string
  readonly environment: string
  readonly event: string
  readonly requestId?: string
  readonly traceId?: string
  readonly runId?: string
  readonly jobId?: string
  readonly fields: SafeFields
}>

export interface EventSink {
  write(event: StructuredEvent): void
}

export type ObservabilityOptions = Readonly<{
  readonly sink: EventSink
  readonly service: string
  readonly environment: string
  readonly now?: () => Date
  readonly createId?: CorrelationIdFactory
}>

export interface Observability {
  scope(seed?: CorrelationContext | CorrelationIds): CorrelationContext
  emit(input: EventInput): StructuredEvent
  record(input: EventInput): StructuredEvent
  metric(input: MetricInput): StructuredEvent
}
