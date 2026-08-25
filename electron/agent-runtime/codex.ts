import { CliProvider, type CliProviderConfiguration, type ProtocolEvent, type StreamParser } from './adapter.js'
import { buildCodexArgs } from './commands.js'
import { agentRuntimeErrorMessage, type AgentMetadata, type AgentRunOptions, type AgentRuntimeError, type DesktopProviderId } from './contracts.js'
import { isJsonObject, parseJsonObject, scalarMetadata, stringAt } from './protocol.js'

function codexError(code: AgentRuntimeError['code'], _message: string, retryable: boolean): AgentRuntimeError {
  return { code, message: agentRuntimeErrorMessage(code), retryable }
}

function codexMetadata(value: unknown): AgentMetadata {
  return scalarMetadata(value, ['thread_id', 'turn_id', 'status'])
}

/** Parser for `codex exec --json` JSONL events. */
export class CodexStreamParser implements StreamParser {
  private responseText = ''

  push(line: string): readonly ProtocolEvent[] {
    if (!line.trim()) return []
    const record = parseJsonObject(line)
    if (!record) return [{ type: 'error', error: codexError('malformed-stream-event', 'Codex emitted malformed JSONL.', false) }]
    const type = stringAt(record, 'type')
    if (!type) return [{ type: 'error', error: codexError('malformed-stream-event', 'Codex emitted an event without a type.', false) }]
    if (type === 'thread.started') return [{ type: 'init', metadata: codexMetadata(record) }]
    if (type === 'item.completed') {
      const item = record.item
      const text = isJsonObject(item) && stringAt(item, 'type') === 'agent_message' ? stringAt(item, 'text') : undefined
      if (!text) return []
      this.responseText += text
      return [{ type: 'text-delta', text, metadata: codexMetadata(record) }]
    }
    if (type === 'turn.completed') {
      const metadata = codexMetadata(record)
      return [
        { type: 'result', text: this.responseText, metadata },
        { type: 'done', outcome: 'success', retryable: false, metadata },
      ]
    }
    if (type === 'turn.failed' || type === 'error') {
      const metadata = codexMetadata(record)
      return [
        { type: 'error', error: codexError('provider-result-error', 'Codex reported an unsuccessful turn.', true), metadata },
        { type: 'done', outcome: 'error', retryable: true, metadata },
      ]
    }
    return []
  }
}

export class CodexProvider extends CliProvider {
  readonly id: DesktopProviderId = 'codex'

  constructor(configuration: Omit<CliProviderConfiguration, 'executableName' | 'authenticationProbe'> & { executableName?: string }) {
    super({ ...configuration, executableName: configuration.executableName ?? 'codex', authenticationProbe: ['login', 'status'] })
  }

  protected buildArgs(options: AgentRunOptions): readonly string[] {
    return buildCodexArgs(options)
  }

  protected createParser(): StreamParser {
    return new CodexStreamParser()
  }
}
