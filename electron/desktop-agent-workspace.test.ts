import { chmod, mkdir, mkdtemp, realpath, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { prepareDesktopAgentWorkspace } from './desktop-agent-workspace.js'

describe('desktop agent workspace', () => {
  it('creates an empty owner-only read-only workspace and preserves unexpected contents', async () => {
    const userData = await mkdtemp(join(tmpdir(), 'paperbridge-user-data-'))
    try {
      const workspace = await prepareDesktopAgentWorkspace(userData)
      expect((await stat(workspace)).mode & 0o777).toBe(0o500)

      await chmod(workspace, 0o700)
      await writeFile(join(workspace, 'unexpected.txt'), 'preserve this')
      await expect(prepareDesktopAgentWorkspace(userData)).rejects.toThrow('must be empty')
    } finally {
      await rm(userData, { recursive: true, force: true })
    }
  })

  it('rejects a workspace symlink instead of following it outside userData', async () => {
    const userData = await mkdtemp(join(tmpdir(), 'paperbridge-user-data-'))
    const outside = await mkdtemp(join(tmpdir(), 'paperbridge-outside-'))
    try {
      await symlink(outside, join(userData, 'paperbridge-agent-workspace'))
      await expect(prepareDesktopAgentWorkspace(userData)).rejects.toThrow('workspace is invalid')
      expect((await stat(outside)).mode & 0o777).not.toBe(0o500)
    } finally {
      await rm(userData, { recursive: true, force: true })
      await rm(outside, { recursive: true, force: true })
    }
  })

  it('uses a canonical userData parent rather than returning a symlinked parent path', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'paperbridge-parent-'))
    const userData = join(parent, 'user-data')
    const alias = join(parent, 'user-data-alias')
    try {
      await mkdir(userData)
      await symlink(userData, alias)
      const workspace = await prepareDesktopAgentWorkspace(alias)
      expect(workspace).toBe(join(await realpath(userData), 'paperbridge-agent-workspace'))
    } finally {
      await rm(parent, { recursive: true, force: true })
    }
  })
})
