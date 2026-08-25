import { CliProvider, type CliProviderConfiguration, type ProtocolEvent, type StreamParser } from './adapter.js'
import { buildClaudeCodeArgs } from './commands.js'
import { agentRuntimeErrorMessage, type AgentMetadata, type AgentRunOptions, type AgentRuntimeError, type DesktopProviderId } from './contracts.js'
import { isJsonObject, parseJsonObject, scalarMetadata, stringAt } from './protocol.js'

function claudeError(code: AgentRuntimeError['code'], _message: string, retryable: boolean): AgentRuntimeError {
  return { code, message: agentRuntimeErrorMessage(code), retryable }
}

function claudeMetadata(value: unknown): AgentMetadata {
  return scalarMetadata(value, ['session_id', 'model', 'subtype', 'is_error'])
}

/** Claude Code stream-json parser; assistant deltas use the nested Anthropic stream event shape. */
export class ClaudeCodeStreamParser implements StreamParser {
  private sawTextDelta = false

  push(line: string): readonly ProtocolEvent[] {
    if (!line.trim()) return []
    const record = parseJsonObject(line)
    if (!record) return [{ type: 'error', error: claudeError('malformed-stream-event', 'Claude Code emitted malformed stream JSON.', false) }]
    const type = stringAt(record, 'type')
    if (!type) return [{ type: 'error', error: claudeError('malformed-stream-event', 'Claude Code emitted an event without a type.', false) }]

    if (type === 'system' && stringAt(record, 'subtype') === 'init') {
      return [{ type: 'init', metadata: claudeMetadata(record) }]
    }
    if (type === 'stream_event') {
      const event = record.event
      if (!isJsonObject(event)) return []
      const delta = event.delta
      const text = isJsonObject(delta) && stringAt(delta, 'type') === 'text_delta' ? stringAt(delta, 'text') : undefined
      if (stringAt(event, 'type') === 'content_block_delta' && text) {
        this.sawTextDelta = true
        return [{ type: 'text-delta', text, metadata: claudeMetadata(record) }]
      }
      return []
    }
    if (type === 'assistant' && !this.sawTextDelta) {
      const message = record.message
      const text = isJsonObject(message) && Array.isArray(message.content)
        ? message.content.filter(isJsonObject).filter((block) => stringAt(block, 'type') === 'text').map((block) => stringAt(block, 'text') ?? '').join('')
        : ''
      return text ? [{ type: 'text-delta', text, metadata: claudeMetadata(record) }] : []
    }
    if (type === 'result') {
      const metadata = claudeMetadata(record)
      if (record.is_error === true || stringAt(record, 'subtype') !== 'success') {
        return [
          { type: 'error', error: claudeError('provider-result-error', 'Claude Code reported an unsuccessful result.', false), metadata },
          { type: 'done', outcome: 'error', retryable: false, metadata },
        ]
      }
      const result = stringAt(record, 'result')
      if (result === undefined) {
        return [{ type: 'error', error: claudeError('malformed-stream-event', 'Claude Code success result had no response text.', false), metadata }]
      }
      return [
        { type: 'result', text: result, metadata },
        { type: 'done', outcome: 'success', retryable: false, metadata },
      ]
    }
    if (type === 'error') {
      return [{ type: 'error', error: claudeError('provider-result-error', 'Claude Code reported a stream error.', true), metadata: claudeMetadata(record) }]
    }
    return []
  }
}

export class ClaudeCodeProvider extends CliProvider {
  readonly id: DesktopProviderId = 'claude-code'

  constructor(configuration: Omit<CliProviderConfiguration, 'executableName' | 'authenticationProbe'> & { executableName?: string }) {
    super({ ...configuration, executableName: configuration.executableName ?? 'claude', authenticationProbe: ['auth', 'status'] })
  }

  protected buildArgs(options: AgentRunOptions): readonly string[] {
    return buildClaudeCodeArgs(options)
  }

  protected createParser(): StreamParser {
    return new ClaudeCodeStreamParser()
  }
}
