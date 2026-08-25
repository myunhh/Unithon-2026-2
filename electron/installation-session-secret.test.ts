import { mkdtemp, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { sessionSecretForInstallation } from './installation-session-secret.js'

describe('installed session secret storage', () => {
  it('creates one private secret and converges simultaneous callers', async () => {
    const userData = await mkdtemp(join(tmpdir(), 'paperbridge-user-data-'))
    try {
      const secrets = await Promise.all(Array.from({ length: 8 }, () => sessionSecretForInstallation(userData)))
      expect(new Set(secrets)).toHaveLength(1)
      expect(secrets[0]).toMatch(/^[A-Za-z0-9_-]{43}$/)
      expect((await stat(join(userData, 'paperbridge-session-secret'))).mode & 0o777).toBe(0o600)
    } finally {
      await rm(userData, { recursive: true, force: true })
    }
  })

  it('rejects symlinked and invalid secret files without exposing their contents', async () => {
    const userData = await mkdtemp(join(tmpdir(), 'paperbridge-user-data-'))
    const secretFile = join(userData, 'paperbridge-session-secret')
    const target = join(userData, 'outside-secret')
    try {
      await writeFile(target, 'A'.repeat(43))
      await symlink(target, secretFile)
      await expect(sessionSecretForInstallation(userData)).rejects.toThrow('session secret is invalid')

      await rm(secretFile)
      await writeFile(secretFile, 'bad')
      await expect(sessionSecretForInstallation(userData)).rejects.toThrow('session secret is invalid')
    } finally {
      await rm(userData, { recursive: true, force: true })
    }
  })
})
