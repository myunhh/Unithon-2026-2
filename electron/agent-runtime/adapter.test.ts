import { describe, expect, it } from 'vitest'
import { CliProvider, type CliProviderConfiguration, type ProtocolEvent, type StreamParser } from './adapter.js'
import type { AgentRunOptions, DesktopProviderId, NormalizedAgentEvent } from './contracts.js'

class NodeFixtureProvider extends CliProvider {
  readonly id: DesktopProviderId = 'codex'

  constructor(workspaceRoot: string) {
    const configuration: CliProviderConfiguration = {
      executableName: 'node',
      workspaceRoot,
      authenticationProbe: ['--version'],
    }
    super(configuration)
  }

  protected buildArgs(_options: AgentRunOptions): readonly string[] {
    return ['--eval', 'process.stdout.write("{\\\"kind\\\":\\\"complete\\\",\\\"text\\\":\\\"ready\\\"}\\n")']
  }

  protected createParser(): StreamParser {
    return {
      push(line): readonly ProtocolEvent[] {
        const record = JSON.parse(line) as { kind?: string; text?: string }
        return record.kind === 'complete' && typeof record.text === 'string'
          ? [
              { type: 'result', text: record.text },
              { type: 'done', outcome: 'success', retryable: false },
            ]
          : []
      },
    }
  }
}

class NonzeroResultProvider extends NodeFixtureProvider {
  protected buildArgs(_options: AgentRunOptions): readonly string[] {
    return [
      '--eval',
      'process.stdout.write("{\\\"kind\\\":\\\"complete\\\",\\\"text\\\":\\\"must-not-publish\\\"}\\n"); process.exit(1)',
    ]
  }
}

async function collect(iterable: AsyncIterable<NormalizedAgentEvent>): Promise<NormalizedAgentEvent[]> {
  const events: NormalizedAgentEvent[] = []
  for await (const event of iterable) events.push(event)
  return events
}

describe('CliProvider', () => {
  it('normalizes a spawned JSONL provider with a consistent run id and terminal done event', async () => {
    const events = await collect(new NodeFixtureProvider(process.cwd()).run({
      runId: 'run-fixture',
      prompt: 'never logged',
      cwd: process.cwd(),
    }))

    expect(events.map((event) => event.type)).toEqual(['started', 'result', 'done'])
    expect(events.every((event) => event.runId === 'run-fixture')).toBe(true)
    expect(events[1]).toMatchObject({ type: 'result', text: 'ready', retryable: false })
    expect(events[2]).toMatchObject({ type: 'done', outcome: 'success', retryable: false })
  })

  it('does not publish a success result when the child exits nonzero after its result event', async () => {
    const events = await collect(new NonzeroResultProvider(process.cwd()).run({
      runId: 'run-nonzero',
      prompt: 'never logged',
      cwd: process.cwd(),
    }))

    expect(events.map((event) => event.type)).toEqual(['started', 'error', 'done'])
    expect(events).toMatchObject([
      { type: 'started' },
      { type: 'error', error: { code: 'process-exited', message: '에이전트가 완료된 응답을 반환하지 않았습니다.', retryable: true } },
      { type: 'done', outcome: 'error', retryable: true },
    ])
    expect(events.some((event) => event.type === 'result')).toBe(false)
  })
})
