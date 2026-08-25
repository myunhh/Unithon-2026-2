import { spawn, type ChildProcessByStdio } from 'node:child_process'
import { realpath } from 'node:fs/promises'
import { isAbsolute, sep } from 'node:path'
import type { Readable } from 'node:stream'
import { buildProviderEnvironment } from './environment.js'

type SpawnedProcess = ChildProcessByStdio<null, Readable, Readable>

export type ProcessFailureKind =
  | 'start'
  | 'timeout'
  | 'cancelled'
  | 'output-limit'
  | 'exit'

export class ProcessRunError extends Error {
  readonly kind: ProcessFailureKind
  readonly exitCode?: number | null

  constructor(kind: ProcessFailureKind, exitCode?: number | null) {
    super(messageForFailure(kind, exitCode))
    this.name = 'ProcessRunError'
    this.kind = kind
    this.exitCode = exitCode
  }
}

function messageForFailure(kind: ProcessFailureKind, exitCode?: number | null): string {
  switch (kind) {
    case 'start': return '에이전트를 시작하지 못했습니다.'
    case 'timeout': return '에이전트 실행 시간이 초과되었습니다.'
    case 'cancelled': return '에이전트 실행이 취소되었습니다.'
    case 'output-limit': return '에이전트 응답이 허용된 크기를 초과했습니다.'
    case 'exit': return exitCode === 0
      ? '에이전트가 완료된 응답을 반환하기 전에 종료되었습니다.'
      : '에이전트가 성공한 결과 없이 종료되었습니다.'
  }
}

export type ProcessLimits = {
  timeoutMs: number
  maxStdoutBytes: number
  maxStderrBytes: number
  maxLineBytes: number
  maxLines: number
  terminationGraceMs: number
}

export const DEFAULT_PROCESS_LIMITS: Readonly<ProcessLimits> = {
  timeoutMs: 5 * 60_000,
  maxStdoutBytes: 2 * 1024 * 1024,
  maxStderrBytes: 256 * 1024,
  maxLineBytes: 256 * 1024,
  maxLines: 10_000,
  terminationGraceMs: 1_500,
}

export type ProcessCommand = {
  executable: string
  args: readonly string[]
  cwd: string
  /** A known workspace root prevents a caller from inheriting an arbitrary cwd. */
  workspaceRoot: string
  signal?: AbortSignal
  limits?: Partial<ProcessLimits>
}

export type ProcessOutputLine = {
  stream: 'stdout' | 'stderr'
  line: string
}

export type ProcessRunResult = {
  exitCode: number | null
  signal: NodeJS.Signals | null
  durationMs: number
  stdoutBytes: number
  stderrBytes: number
  stdoutLines: number
  stderrLines: number
}

type LineFramer = {
  push(chunk: Buffer): string[]
  finish(): string[]
}

/** Splits NDJSON safely when line boundaries cross arbitrary stream chunks. */
export function createLineFramer(maxLineBytes: number): LineFramer {
  let pending = Buffer.alloc(0)

  function split(): string[] {
    const lines: string[] = []
    let index = pending.indexOf(0x0a)
    while (index >= 0) {
      const line = pending.subarray(0, index)
      if (line.length > maxLineBytes) throw new ProcessRunError('output-limit')
      const end = line.length > 0 && line[line.length - 1] === 0x0d ? line.length - 1 : line.length
      lines.push(line.subarray(0, end).toString('utf8'))
      pending = pending.subarray(index + 1)
      index = pending.indexOf(0x0a)
    }
    if (pending.length > maxLineBytes) throw new ProcessRunError('output-limit')
    return lines
  }

  return {
    push(chunk) {
      pending = pending.length === 0 ? Buffer.from(chunk) : Buffer.concat([pending, chunk])
      return split()
    },
    finish() {
      if (pending.length === 0) return []
      if (pending.length > maxLineBytes) throw new ProcessRunError('output-limit')
      const line = pending[pending.length - 1] === 0x0d ? pending.subarray(0, -1) : pending
      pending = Buffer.alloc(0)
      return [line.toString('utf8')]
    },
  }
}

async function controlledCwd(cwd: string, workspaceRoot: string): Promise<string | undefined> {
  if (!isAbsolute(cwd) || !isAbsolute(workspaceRoot)) return undefined
  try {
    // Canonical paths prevent a symlink inside the workspace from bypassing the
    // integration's cwd boundary.
    const [canonicalCwd, canonicalRoot] = await Promise.all([realpath(cwd), realpath(workspaceRoot)])
    return canonicalCwd === canonicalRoot || canonicalCwd.startsWith(`${canonicalRoot}${sep}`)
      ? canonicalCwd
      : undefined
  } catch {
    return undefined
  }
}

function applyLimits(overrides: Partial<ProcessLimits> | undefined): ProcessLimits {
  const limits = { ...DEFAULT_PROCESS_LIMITS, ...overrides }
  if (Object.values(limits).some((value) => !Number.isSafeInteger(value) || value <= 0)) {
    throw new Error('Process limits must be positive safe integers.')
  }
  return limits
}

async function terminateProcessTree(child: SpawnedProcess, graceMs: number): Promise<void> {
  if (!child.pid || child.exitCode !== null) return
  const pid = child.pid
  if (process.platform === 'win32') {
    // taskkill is invoked with an argv array and /T targets only this process tree.
    await new Promise<void>((resolveDone) => {
      const killer = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { shell: false, windowsHide: true })
      killer.once('error', () => resolveDone())
      killer.once('close', () => resolveDone())
    })
    return
  }

  try {
    process.kill(-pid, 'SIGTERM')
  } catch {
    child.kill('SIGTERM')
  }
  await new Promise((resolveDone) => setTimeout(resolveDone, graceMs))
  if (child.exitCode === null) {
    try {
      process.kill(-pid, 'SIGKILL')
    } catch {
      child.kill('SIGKILL')
    }
  }
}

/**
 * Spawn one exact argv command. Output is processed in-memory only and never
 * copied into thrown errors, keeping prompts and credentials out of logs.
 */
export class ProcessRunner {
  async run(command: ProcessCommand, onLine: (line: ProcessOutputLine) => void): Promise<ProcessRunResult> {
    const cwd = await controlledCwd(command.cwd, command.workspaceRoot)
    if (!cwd) {
      throw new ProcessRunError('start')
    }
    const limits = applyLimits(command.limits)
    if (command.signal?.aborted) throw new ProcessRunError('cancelled')

    const startedAt = Date.now()
    let child: SpawnedProcess
    try {
      child = spawn(command.executable, [...command.args], {
        cwd,
        detached: process.platform !== 'win32',
        env: buildProviderEnvironment(),
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      })
    } catch {
      throw new ProcessRunError('start')
    }

    let stdoutBytes = 0
    let stderrBytes = 0
    let stdoutLines = 0
    let stderrLines = 0
    let forcedFailure: ProcessRunError | undefined
    const stdoutFramer = createLineFramer(limits.maxLineBytes)
    const stderrFramer = createLineFramer(limits.maxLineBytes)

    const stopFor = (failure: ProcessRunError) => {
      if (forcedFailure) return
      forcedFailure = failure
      void terminateProcessTree(child, limits.terminationGraceMs)
    }
    const emitLines = (stream: 'stdout' | 'stderr', lines: readonly string[]) => {
      for (const line of lines) {
        if (stream === 'stdout') stdoutLines += 1
        else stderrLines += 1
        if (stdoutLines + stderrLines > limits.maxLines) throw new ProcessRunError('output-limit')
        onLine({ stream, line })
      }
    }
    const consume = (stream: 'stdout' | 'stderr', chunk: Buffer) => {
      if (forcedFailure) return
      if (stream === 'stdout') stdoutBytes += chunk.length
      else stderrBytes += chunk.length
      if (stdoutBytes > limits.maxStdoutBytes || stderrBytes > limits.maxStderrBytes) {
        stopFor(new ProcessRunError('output-limit'))
        return
      }
      try {
        const framer = stream === 'stdout' ? stdoutFramer : stderrFramer
        emitLines(stream, framer.push(chunk))
      } catch (error) {
        stopFor(error instanceof ProcessRunError ? error : new ProcessRunError('output-limit'))
      }
    }

    child.stdout.on('data', (chunk: Buffer) => consume('stdout', chunk))
    child.stderr.on('data', (chunk: Buffer) => consume('stderr', chunk))

    const onAbort = () => stopFor(new ProcessRunError('cancelled'))
    command.signal?.addEventListener('abort', onAbort, { once: true })
    const timeout = setTimeout(() => stopFor(new ProcessRunError('timeout')), limits.timeoutMs)

    try {
      const outcome = await new Promise<{ exitCode: number | null; signal: NodeJS.Signals | null }>((resolveOutcome, rejectOutcome) => {
        child.once('error', () => rejectOutcome(new ProcessRunError('start')))
        child.once('close', (exitCode, signal) => resolveOutcome({ exitCode, signal }))
      })
      if (!forcedFailure) {
        try {
          emitLines('stdout', stdoutFramer.finish())
          emitLines('stderr', stderrFramer.finish())
        } catch (error) {
          forcedFailure = error instanceof ProcessRunError ? error : new ProcessRunError('output-limit')
        }
      }
      if (forcedFailure) throw forcedFailure
      if (outcome.exitCode !== 0) throw new ProcessRunError('exit', outcome.exitCode)
      return {
        ...outcome,
        durationMs: Date.now() - startedAt,
        stdoutBytes,
        stderrBytes,
        stdoutLines,
        stderrLines,
      }
    } finally {
      clearTimeout(timeout)
      command.signal?.removeEventListener('abort', onAbort)
    }
  }
}
