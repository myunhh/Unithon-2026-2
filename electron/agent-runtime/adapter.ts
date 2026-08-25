import { agentRuntimeErrorMessage, normalizeAgentRuntimeError } from './contracts.js'
import type {
  AgentMetadata,
  AgentRunOptions,
  AgentRuntimeError,
  AgentRuntimeErrorCode,
  DesktopAgentProvider,
  DesktopProviderId,
  NormalizedAgentEvent,
  ProviderHealth,
} from './contracts.js'
import { discoverExecutableOnPath } from './executable.js'
import { ProcessRunError, ProcessRunner, type ProcessFailureKind } from './process.js'

export type ProtocolEvent =
  | { type: 'init'; metadata: AgentMetadata }
  | { type: 'text-delta'; text: string; metadata?: AgentMetadata }
  | { type: 'result'; text: string; metadata?: AgentMetadata }
  | { type: 'error'; error: AgentRuntimeError; metadata?: AgentMetadata }
  | { type: 'done'; outcome: 'success' | 'error' | 'cancelled'; retryable: boolean; metadata?: AgentMetadata }

export interface StreamParser {
  push(line: string): readonly ProtocolEvent[]
}

export type CliProviderConfiguration = {
  executableName: string
  workspaceRoot: string
  runner?: ProcessRunner
  /** This command must not send a model prompt or modify provider state. */
  authenticationProbe: readonly string[]
}

class AsyncEventQueue<T> {
  private readonly items: T[] = []
  private readonly waiters: Array<(value: IteratorResult<T>) => void> = []
  private closed = false

  push(value: T): void {
    if (this.closed) return
    const waiter = this.waiters.shift()
    if (waiter) waiter({ done: false, value })
    else this.items.push(value)
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    for (const waiter of this.waiters.splice(0)) waiter({ done: true, value: undefined })
  }

  async next(): Promise<IteratorResult<T>> {
    const item = this.items.shift()
    if (item !== undefined) return { done: false, value: item }
    if (this.closed) return { done: true, value: undefined }
    return new Promise((resolveNext) => this.waiters.push(resolveNext))
  }
}

function metadataWith(base: AgentMetadata, addition?: AgentMetadata): AgentMetadata {
  return addition ? { ...base, ...addition } : base
}

function failureFromProcess(error: ProcessRunError): AgentRuntimeError {
  const mapped: Record<ProcessFailureKind, { code: AgentRuntimeErrorCode; retryable: boolean }> = {
    start: { code: 'process-start-failed', retryable: true },
    timeout: { code: 'process-timeout', retryable: true },
    cancelled: { code: 'process-cancelled', retryable: true },
    'output-limit': { code: 'process-output-limit', retryable: false },
    exit: { code: 'process-exited', retryable: true },
  }
  const kind = mapped[error.kind]
  return { code: kind.code, message: agentRuntimeErrorMessage(kind.code), retryable: kind.retryable }
}

function now(): string {
  return new Date().toISOString()
}

/** Shared lifecycle, health, output-cap, and cancellation behavior for CLI providers. */
export abstract class CliProvider implements DesktopAgentProvider {
  abstract readonly id: DesktopProviderId

  protected readonly executableName: string
  protected readonly workspaceRoot: string
  protected readonly runner: ProcessRunner
  private readonly authenticationProbe: readonly string[]

  protected constructor(configuration: CliProviderConfiguration) {
    this.executableName = configuration.executableName
    this.workspaceRoot = configuration.workspaceRoot
    this.runner = configuration.runner ?? new ProcessRunner()
    this.authenticationProbe = configuration.authenticationProbe
  }

  protected abstract buildArgs(options: AgentRunOptions): readonly string[]
  protected abstract createParser(): StreamParser

  async healthCheck(): Promise<ProviderHealth> {
    const checkedAt = now()
    const discovery = await discoverExecutableOnPath(this.executableName)
    const executablePath = discovery.executablePath
    if (!executablePath) {
      return {
        providerId: this.id,
        status: discovery.unsupportedWindowsShim ? 'limited' : 'failed',
        authenticated: false,
        checkedAt,
        message: discovery.unsupportedWindowsShim
          ? '에이전트가 지원되지 않는 방식으로 설치되어 있습니다.'
          : '에이전트를 사용할 수 없습니다.',
      }
    }

    const probe = async (args: readonly string[]): Promise<boolean> => {
      try {
        await this.runner.run({
          executable: executablePath,
          args,
          cwd: this.workspaceRoot,
          workspaceRoot: this.workspaceRoot,
          limits: { timeoutMs: 3_000, maxStdoutBytes: 32 * 1024, maxStderrBytes: 32 * 1024, maxLines: 200 },
        }, () => undefined)
        return true
      } catch {
        return false
      }
    }

    if (!await probe(['--version'])) {
      return {
        providerId: this.id,
        status: 'failed',
        executablePath,
        authenticated: false,
        checkedAt,
        message: '에이전트 상태를 확인하지 못했습니다.',
      }
    }
    const authenticated = await probe(this.authenticationProbe)
    return {
      providerId: this.id,
      status: authenticated ? 'healthy' : 'limited',
      executablePath,
      authenticated,
      checkedAt,
      message: authenticated
        ? '에이전트와 인증 상태를 확인했습니다.'
        : '에이전트 인증 상태를 확인할 수 없습니다.',
    }
  }

  async *run(options: AgentRunOptions): AsyncIterable<NormalizedAgentEvent> {
    const discovery = await discoverExecutableOnPath(this.executableName)
    const executablePath = discovery.executablePath
    const baseMetadata: AgentMetadata = { executable: this.executableName }
    if (!executablePath) {
      yield this.errorEvent(options.runId, baseMetadata, {
        code: discovery.unsupportedWindowsShim ? 'provider-unavailable' : 'executable-not-found',
        message: discovery.unsupportedWindowsShim
          ? '에이전트를 사용할 수 없습니다.'
          : '에이전트 실행 파일을 찾을 수 없습니다.',
        retryable: !discovery.unsupportedWindowsShim,
      })
      yield this.doneEvent(options.runId, baseMetadata, 'error', !discovery.unsupportedWindowsShim)
      return
    }

    const queue = new AsyncEventQueue<NormalizedAgentEvent>()
    const parser = this.createParser()
    let protocolMetadata: AgentMetadata = baseMetadata
    let terminalEventSeen = false
    let protocolFailed = false
    let protocolFailureRetryable = false
    let pendingResult: { text: string; metadata: AgentMetadata } | undefined
    let pendingSuccess: { metadata: AgentMetadata; retryable: boolean } | undefined
    const controller = new AbortController()
    const forwardAbort = () => controller.abort()
    options.signal?.addEventListener('abort', forwardAbort, { once: true })

    const emitProtocol = (event: ProtocolEvent) => {
      const metadata = metadataWith(protocolMetadata, event.metadata)
      switch (event.type) {
        case 'init':
          protocolMetadata = metadataWith(protocolMetadata, event.metadata)
          return
        case 'text-delta':
          if (!terminalEventSeen && !pendingSuccess && event.text) {
            queue.push({ type: 'text-delta', runId: options.runId, occurredAt: now(), providerId: this.id, metadata, retryable: false, text: event.text })
          }
          return
        case 'result':
          if (!terminalEventSeen && !pendingSuccess) pendingResult = { text: event.text, metadata }
          return
        case 'error':
          if (!terminalEventSeen) {
            pendingResult = undefined
            pendingSuccess = undefined
            queue.push(this.errorEvent(options.runId, metadata, event.error))
            protocolFailed = true
            protocolFailureRetryable = event.error.retryable
          }
          return
        case 'done':
          if (!terminalEventSeen) {
            if (event.outcome === 'success') {
              if (pendingResult) {
                pendingSuccess = { metadata, retryable: event.retryable }
              } else {
                protocolFailed = true
                protocolFailureRetryable = false
                queue.push(this.errorEvent(options.runId, metadata, {
                  code: 'malformed-stream-event',
                  message: '에이전트 응답에 결과가 없습니다.',
                  retryable: false,
                }))
              }
            } else {
              pendingResult = undefined
              terminalEventSeen = true
              queue.push(this.doneEvent(options.runId, metadata, event.outcome, event.retryable))
            }
          }
      }
    }

    queue.push({ type: 'started', runId: options.runId, occurredAt: now(), providerId: this.id, metadata: baseMetadata, retryable: false })
    const execution = this.runner.run({
      executable: executablePath,
      args: this.buildArgs(options),
      cwd: options.cwd,
      workspaceRoot: this.workspaceRoot,
      signal: controller.signal,
      limits: options.timeoutMs === undefined ? undefined : { timeoutMs: options.timeoutMs },
    }, ({ stream, line }) => {
      if (stream !== 'stdout' || terminalEventSeen || pendingSuccess || protocolFailed) return
      const events = parser.push(line)
      for (const event of events) emitProtocol(event)
      if (protocolFailed && !terminalEventSeen) {
        emitProtocol({ type: 'done', outcome: 'error', retryable: protocolFailureRetryable })
        controller.abort()
      }
    }).then(() => {
      if (!terminalEventSeen && pendingResult && pendingSuccess) {
        terminalEventSeen = true
        queue.push({ type: 'result', runId: options.runId, occurredAt: now(), providerId: this.id, metadata: pendingResult.metadata, retryable: false, text: pendingResult.text })
        queue.push(this.doneEvent(options.runId, pendingSuccess.metadata, 'success', pendingSuccess.retryable))
      } else if (!terminalEventSeen) {
        emitProtocol({
          type: 'error',
          error: { code: 'process-exited', message: '에이전트가 완료된 응답을 반환하지 않았습니다.', retryable: true },
        })
        emitProtocol({ type: 'done', outcome: 'error', retryable: true })
      }
    }).catch((error: unknown) => {
      if (!terminalEventSeen && !protocolFailed) {
        const failure = error instanceof ProcessRunError
          ? failureFromProcess(error)
          : { code: 'process-start-failed' as const, message: '에이전트를 시작하지 못했습니다.', retryable: true }
        emitProtocol({ type: 'error', error: failure })
        emitProtocol({ type: 'done', outcome: failure.code === 'process-cancelled' ? 'cancelled' : 'error', retryable: failure.retryable })
      }
    }).finally(() => {
      options.signal?.removeEventListener('abort', forwardAbort)
      queue.close()
    })
    void execution

    try {
      for (;;) {
        const item = await queue.next()
        if (item.done) return
        yield item.value
      }
    } finally {
      // Consumers may stop listening (for example when a window closes). That
      // is a cancellation request for this exact child process tree.
      if (!terminalEventSeen) controller.abort()
    }
  }

  private errorEvent(runId: string, metadata: AgentMetadata, error: AgentRuntimeError): NormalizedAgentEvent {
    const safeError = normalizeAgentRuntimeError(error)
    return { type: 'error', runId, occurredAt: now(), providerId: this.id, metadata, retryable: safeError.retryable, error: safeError }
  }

  private doneEvent(
    runId: string,
    metadata: AgentMetadata,
    outcome: 'success' | 'error' | 'cancelled',
    retryable: boolean,
  ): NormalizedAgentEvent {
    return { type: 'done', runId, occurredAt: now(), providerId: this.id, metadata, retryable, outcome }
  }
}
