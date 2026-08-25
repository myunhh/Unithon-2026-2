import { spawn } from 'node:child_process'
import { cp, mkdtemp, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

type ChildResult = {
  readonly code: number | null
  readonly signal: NodeJS.Signals | null
  readonly stdout: string
  readonly stderr: string
}

const tsxCli = join(process.cwd(), 'node_modules/tsx/dist/cli.mjs')

async function cleanArchive(): Promise<{ readonly root: string; readonly entrypoint: string }> {
  const root = await mkdtemp(join(tmpdir(), 'paperbridge-clean-archive-'))
  await cp(join(process.cwd(), 'server'), join(root, 'server'), { recursive: true })
  await symlink(join(process.cwd(), 'node_modules'), join(root, 'node_modules'), 'dir')
  return { root, entrypoint: join(root, 'server/index.ts') }
}

function runChild(entrypoint: string, cwd: string, environment: NodeJS.ProcessEnv): Promise<ChildResult> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [tsxCli, entrypoint], {
      cwd,
      env: environment,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    let settled = false
    let hardKillTimer: ReturnType<typeof setTimeout> | undefined
    const killTimer = setTimeout(() => {
      child.kill('SIGTERM')
      hardKillTimer = setTimeout(() => child.kill('SIGKILL'), 250)
    }, 1_500)
    const finish = (code: number | null, signal: NodeJS.Signals | null) => {
      if (settled) return
      settled = true
      clearTimeout(killTimer)
      if (hardKillTimer !== undefined) clearTimeout(hardKillTimer)
      resolve({ code, signal, stdout, stderr })
    }

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => { stdout += chunk })
    child.stderr.on('data', (chunk: string) => { stderr += chunk })
    child.once('error', (error: Error) => {
      stderr += error.message
      finish(null, null)
    })
    child.once('close', finish)
  })
}

describe('server startup boundary', () => {
  it('fails clean-archive startup safely when production configuration is invalid', async () => {
    const invalidSessionSecret = 'invalid-production-session-sentinel!'
    const archive = await cleanArchive()
    try {
      const result = await runChild(archive.entrypoint, archive.root, {
        PATH: process.env.PATH,
        NODE_ENV: 'production',
        PORT: '18793',
        APP_ORIGINS: 'http://127.0.0.1:5173',
        PAPERBRIDGE_SESSION_SECRET: invalidSessionSecret,
      })

      expect(result.code).not.toBe(0)
      expect(result.signal).toBeNull()
      expect(result.stdout).toBe('')
      expect(result.stderr).toContain('PaperBridge API configuration is invalid.')
      expect(result.stderr).not.toContain(invalidSessionSecret)
      expect(result.stderr).not.toContain(archive.root)
      expect(result.stderr).not.toContain(process.cwd())
      expect(result.stderr).not.toMatch(/(?:^|\s)(?:\/|[A-Za-z]:[\\/])/)
      expect(result.stderr).not.toContain('\n    at ')
    } finally {
      await rm(archive.root, { recursive: true, force: true })
    }
  })
})
