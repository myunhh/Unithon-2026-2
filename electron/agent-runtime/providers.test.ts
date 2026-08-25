import { describe, expect, it } from 'vitest'
import { ClaudeCodeStreamParser } from './claude-code.js'
import { buildClaudeCodeArgs, buildCodexArgs } from './commands.js'
import { CodexStreamParser } from './codex.js'

describe('Claude Code stream-json', () => {
  it('maps nested text deltas and its terminal result', () => {
    const parser = new ClaudeCodeStreamParser()
    expect(parser.push('{"type":"system","subtype":"init","session_id":"s-1","model":"sonnet"}')).toEqual([
      { type: 'init', metadata: { session_id: 's-1', model: 'sonnet', subtype: 'init' } },
    ])
    expect(parser.push('{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"Hi"}}}')).toEqual([
      { type: 'text-delta', text: 'Hi', metadata: {} },
    ])
    expect(parser.push('{"type":"result","subtype":"success","is_error":false,"result":"Hi","session_id":"s-1"}')).toEqual([
      { type: 'result', text: 'Hi', metadata: { session_id: 's-1', subtype: 'success', is_error: false } },
      { type: 'done', outcome: 'success', retryable: false, metadata: { session_id: 's-1', subtype: 'success', is_error: false } },
    ])
  })
})

describe('Codex JSONL', () => {
  it('accumulates completed agent messages until turn completion', () => {
    const parser = new CodexStreamParser()
    expect(parser.push('{"type":"thread.started","thread_id":"t-1"}')).toEqual([{ type: 'init', metadata: { thread_id: 't-1' } }])
    expect(parser.push('{"type":"item.completed","item":{"type":"agent_message","text":"First "}}')).toEqual([
      { type: 'text-delta', text: 'First ', metadata: {} },
    ])
    expect(parser.push('{"type":"item.completed","item":{"type":"agent_message","text":"second"}}')).toEqual([
      { type: 'text-delta', text: 'second', metadata: {} },
    ])
    expect(parser.push('{"type":"turn.completed","thread_id":"t-1"}')).toEqual([
      { type: 'result', text: 'First second', metadata: { thread_id: 't-1' } },
      { type: 'done', outcome: 'success', retryable: false, metadata: { thread_id: 't-1' } },
    ])
  })
})

describe('isolated command builders', () => {
  it('keeps provider argv arrays shell-free and does not add permission-bypass flags', () => {
    const options = { runId: 'r', prompt: 'read only', cwd: '/workspace', model: 'm' } as const
    expect(buildClaudeCodeArgs(options)).toEqual([
      '-p', 'read only', '--output-format', 'stream-json', '--verbose', '--permission-mode', 'plan', '--model', 'm',
    ])
    expect(buildCodexArgs(options)).toEqual(['exec', '--json', '--sandbox', 'read-only', '--model', 'm', '--', 'read only'])
  })

  it.each(['--version', '--dangerously-bypass-approvals-and-sandbox', '--sandbox=danger-full-access'])(
    'keeps option-looking Codex prompt %s after the end-of-options marker',
    (prompt) => {
      expect(buildCodexArgs({ runId: 'r', prompt, cwd: '/workspace' })).toEqual([
        'exec', '--json', '--sandbox', 'read-only', '--', prompt,
      ])
    },
  )
})
