import { CliProvider, type CliProviderConfiguration, type ProtocolEvent, type StreamParser } from './adapter.js'
import { buildAgyArgs } from './commands.js'
import { agentRuntimeErrorMessage, type AgentMetadata, type AgentRunOptions, type AgentRuntimeError, type DesktopProviderId } from './contracts.js'
import { isJsonObject, parseJsonObject, scalarMetadata, stringAt } from './protocol.js'

const AgyTerminalStatuses = new Set(['SUCCESS', 'ERROR', 'CANCELED', 'INTERRUPTED', 'INVALID', 'WAITING', 'RUNNING'])

function agyError(code: AgentRuntimeError['code'], _message: string, retryable: boolean): AgentRuntimeError {
  return { code, message: agentRuntimeErrorMessage(code), retryable }
}

function agyMetadata(value: unknown): AgentMetadata {
  return scalarMetadata(value, ['conversation_id', 'duration_seconds', 'num_turns', 'model', 'agent', 'permission_mode', 'state', 'step_index'])
}

/** Parser for agy v1.1.20 `--output-format stream-json` output. */
export class AgyStreamParser implements StreamParser {
  push(line: string): readonly ProtocolEvent[] {
    if (!line.trim()) return []
    const event = parseJsonObject(line)
    if (!event) {
      return [{ type: 'error', error: agyError('malformed-stream-event', 'The Agy CLI emitted malformed stream JSON.', false) }]
    }
    switch (stringAt(event, 'event')) {
      case 'init': {
        const init = event.init
        if (!isJsonObject(init)) {
          return [{ type: 'error', error: agyError('malformed-stream-event', 'The Agy CLI emitted an invalid init event.', false) }]
        }
        return [{ type: 'init', metadata: { ...agyMetadata(event), ...agyMetadata(init) } }]
      }
      case 'step_update': {
        const update = event.step_update
        if (!isJsonObject(update)) {
          return [{ type: 'error', error: agyError('malformed-stream-event', 'The Agy CLI emitted an invalid step event.', false) }]
        }
        const text = stringAt(update, 'text_delta')
        return stringAt(update, 'step_type') === 'agent_response' && text
          ? [{ type: 'text-delta', text, metadata: agyMetadata(update) }]
          : []
      }
      case 'result':
        return this.resultEvents(event.result)
      default:
        // The official protocol permits future event names; safely ignore them.
        return []
    }
  }

  private resultEvents(value: unknown): readonly ProtocolEvent[] {
    if (!isJsonObject(value)) {
      return [{ type: 'error', error: agyError('malformed-stream-event', 'The Agy CLI emitted an invalid result event.', false) }]
    }
    const status = stringAt(value, 'status')
    if (!status || !AgyTerminalStatuses.has(status)) {
      return [{ type: 'error', error: agyError('malformed-stream-event', 'The Agy CLI returned an unknown result status.', false) }]
    }
    const metadata = { ...agyMetadata(value), status }
    if (status === 'SUCCESS') {
      const response = stringAt(value, 'response')
      if (response === undefined) {
        return [{ type: 'error', error: agyError('malformed-stream-event', 'The Agy CLI success result had no response text.', false), metadata }]
      }
      return [
        { type: 'result', text: response, metadata },
        { type: 'done', outcome: 'success', retryable: false, metadata },
      ]
    }
    if (status === 'CANCELED' || status === 'INTERRUPTED') {
      return [
        { type: 'error', error: agyError('process-cancelled', 'The Agy CLI cancelled the run.', true), metadata },
        { type: 'done', outcome: 'cancelled', retryable: true, metadata },
      ]
    }
    if (status === 'WAITING' || status === 'RUNNING') {
      return [
        { type: 'error', error: agyError('provider-nonterminal-result', 'The Agy CLI ended without a terminal result status.', true), metadata },
        { type: 'done', outcome: 'error', retryable: true, metadata },
      ]
    }
    return [
      { type: 'error', error: agyError('provider-result-error', 'The Agy CLI reported an unsuccessful result.', false), metadata },
      { type: 'done', outcome: 'error', retryable: false, metadata },
    ]
  }
}

export class AgyProvider extends CliProvider {
  readonly id: DesktopProviderId = 'agy'

  constructor(configuration: Omit<CliProviderConfiguration, 'executableName' | 'authenticationProbe'> & { executableName?: string }) {
    // `agy models` is a bounded no-prompt query. It exercises only cached CLI
    // credentials and never submits a model request or reads credential files.
    super({ ...configuration, executableName: configuration.executableName ?? 'agy', authenticationProbe: ['models'] })
  }

  protected buildArgs(options: AgentRunOptions): readonly string[] {
    return buildAgyArgs(options)
  }

  protected createParser(): StreamParser {
    return new AgyStreamParser()
  }
}
