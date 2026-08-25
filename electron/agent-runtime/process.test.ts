import { describe, expect, it } from 'vitest'
import { createLineFramer, ProcessRunError, ProcessRunner } from './process.js'

function nodeCommand(args: readonly string[], limits: Record<string, number> = {}) {
  return {
    executable: process.execPath,
    args,
    cwd: process.cwd(),
    workspaceRoot: process.cwd(),
    limits: { terminationGraceMs: 10, ...limits },
  }
}

describe('createLineFramer', () => {
  it('frames NDJSON across arbitrary chunk boundaries', () => {
    const framer = createLineFramer(128)
    expect(framer.push(Buffer.from('{"a":'))).toEqual([])
    expect(framer.push(Buffer.from('1}\n{"b":2}\r\n'))).toEqual(['{"a":1}', '{"b":2}'])
    expect(framer.push(Buffer.from('{"c":'))).toEqual([])
    expect(framer.finish()).toEqual(['{"c":'])
  })

  it('rejects an oversized unfinished line before unbounded buffering', () => {
    const framer = createLineFramer(4)
    expect(() => framer.push(Buffer.from('12345'))).toThrow(ProcessRunError)
  })

  it('counts the final unterminated line against maxLines', async () => {
    const runner = new ProcessRunner()
    await expect(runner.run(
      nodeCommand(['--eval', 'process.stdout.write("first\\nsecond")'], { maxLines: 1 }),
      () => undefined,
    )).rejects.toMatchObject({ kind: 'output-limit' })
  })

  it('does not forward application secrets to provider children', async () => {
    const original = process.env.PAPERBRIDGE_SESSION_SECRET
    process.env.PAPERBRIDGE_SESSION_SECRET = 'must-not-reach-child'
    const lines: string[] = []
    try {
      await new ProcessRunner().run(
        nodeCommand(['--eval', 'process.stdout.write(String(process.env.PAPERBRIDGE_SESSION_SECRET))']),
        ({ line }) => lines.push(line),
      )
    } finally {
      if (original === undefined) delete process.env.PAPERBRIDGE_SESSION_SECRET
      else process.env.PAPERBRIDGE_SESSION_SECRET = original
    }
    expect(lines).toEqual(['undefined'])
  })

  it('cancels the spawned process tree when its signal aborts', async () => {
    const controller = new AbortController()
    const run = new ProcessRunner().run({
      ...nodeCommand(['--eval', 'setInterval(() => undefined, 1_000)']),
      signal: controller.signal,
    }, () => undefined)
    setTimeout(() => controller.abort(), 25)
    await expect(run).rejects.toMatchObject({ kind: 'cancelled' })
  })

  it('enforces timeout and output caps', async () => {
    await expect(new ProcessRunner().run(
      nodeCommand(['--eval', 'setInterval(() => undefined, 1_000)'], { timeoutMs: 25 }),
      () => undefined,
    )).rejects.toMatchObject({ kind: 'timeout' })
    await expect(new ProcessRunner().run(
      nodeCommand(['--eval', 'process.stdout.write("x".repeat(128))'], { maxStdoutBytes: 64 }),
      () => undefined,
    )).rejects.toMatchObject({ kind: 'output-limit' })
  })
})
