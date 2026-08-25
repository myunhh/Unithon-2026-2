import { describe, expect, it } from 'vitest'
import { AgyStreamParser } from './agy.js'
import { buildAgyArgs } from './commands.js'

describe('AgyStreamParser', () => {
  it('maps init, streamed agent response text, and SUCCESS result', () => {
    const parser = new AgyStreamParser()

    expect(parser.push('{"event":"init","conversation_id":"c-1","init":{"permission_mode":"request-review","model":"gemini"}}'))
      .toEqual([{ type: 'init', metadata: { conversation_id: 'c-1', permission_mode: 'request-review', model: 'gemini' } }])
    expect(parser.push('{"event":"step_update","step_update":{"conversation_id":"c-1","step_index":2,"state":"ACTIVE","step_type":"agent_response","text_delta":"Hello"}}'))
      .toEqual([{ type: 'text-delta', text: 'Hello', metadata: { conversation_id: 'c-1', step_index: 2, state: 'ACTIVE' } }])
    expect(parser.push('{"event":"result","result":{"conversation_id":"c-1","status":"SUCCESS","response":"Hello","duration_seconds":1.2,"num_turns":1}}'))
      .toEqual([
        { type: 'result', text: 'Hello', metadata: { conversation_id: 'c-1', duration_seconds: 1.2, num_turns: 1, status: 'SUCCESS' } },
        { type: 'done', outcome: 'success', retryable: false, metadata: { conversation_id: 'c-1', duration_seconds: 1.2, num_turns: 1, status: 'SUCCESS' } },
      ])
  })

  it.each(['WAITING', 'RUNNING'] as const)('rejects nonterminal %s result statuses', (status) => {
    const events = new AgyStreamParser().push(`{"event":"result","result":{"status":"${status}","response":""}}`)
    expect(events).toMatchObject([
      { type: 'error', error: { code: 'provider-nonterminal-result', retryable: true } },
      { type: 'done', outcome: 'error', retryable: true },
    ])
  })

  it.each([
    ['ERROR', 'error', 'provider-result-error', false],
    ['CANCELED', 'cancelled', 'process-cancelled', true],
    ['INTERRUPTED', 'cancelled', 'process-cancelled', true],
    ['INVALID', 'error', 'provider-result-error', false],
  ] as const)('maps %s terminal status without exposing provider diagnostics', (status, outcome, code, retryable) => {
    const events = new AgyStreamParser().push(`{"event":"result","result":{"status":"${status}","error":"secret=do-not-expose"}}`)
    expect(events).toMatchObject([
      { type: 'error', error: { code, retryable } },
      { type: 'done', outcome, retryable },
    ])
    expect(JSON.stringify(events)).not.toContain('secret=do-not-expose')
  })

  it('fails closed on malformed output and safely ignores future events', () => {
    expect(new AgyStreamParser().push('{not json')).toMatchObject([
      { type: 'error', error: { code: 'malformed-stream-event', retryable: false } },
    ])
    expect(new AgyStreamParser().push('{"event":"future_event","payload":"ignored"}')).toEqual([])
  })
})

describe('buildAgyArgs', () => {
  it('uses the PaperBridge safe headless flags and optional documented controls', () => {
    expect(buildAgyArgs({
      runId: 'run-1',
      prompt: 'summarize',
      cwd: '/workspace',
      model: 'gemini-3.7-flash-high',
      effort: 'high',
      agent: 'researcher',
      conversationId: 'c-1',
      printTimeout: '90s',
    })).toEqual([
      '-p', 'summarize', '--output-format', 'stream-json', '--mode', 'plan', '--sandbox', '--disable-slash-commands',
      '--model', 'gemini-3.7-flash-high', '--effort', 'high', '--agent', 'researcher', '--conversation', 'c-1', '--print-timeout', '90s',
    ])
  })
})
