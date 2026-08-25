import { mkdtemp, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { providerEncryptionKeyForInstallation } from './provider-encryption-key.js'

describe('provider encryption key installation storage', () => {
  it('persists one separate 32-byte base64url key with owner-only permissions', async () => {
    const userData = await mkdtemp(join(tmpdir(), 'paperbridge-user-data-'))
    try {
      const first = await providerEncryptionKeyForInstallation(userData)
      const second = await providerEncryptionKeyForInstallation(userData)
      expect(first).toMatch(/^base64url:[A-Za-z0-9_-]{43}$/)
      expect(second).toBe(first)
      expect((await stat(join(userData, 'paperbridge-provider-encryption-key'))).mode & 0o777).toBe(0o600)
    } finally {
      await rm(userData, { recursive: true, force: true })
    }
  })

  it('rejects symlinked, invalid, and oversized existing key files without reading them', async () => {
    const userData = await mkdtemp(join(tmpdir(), 'paperbridge-user-data-'))
    const keyFile = join(userData, 'paperbridge-provider-encryption-key')
    const target = join(userData, 'outside-key')
    try {
      await writeFile(target, 'base64url:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n')
      await symlink(target, keyFile)
      await expect(providerEncryptionKeyForInstallation(userData)).rejects.toThrow('provider encryption key is invalid')

      await rm(keyFile)
      await writeFile(keyFile, 'not-a-provider-key\n')
      await expect(providerEncryptionKeyForInstallation(userData)).rejects.toThrow('provider encryption key is invalid')

      await writeFile(keyFile, 'x'.repeat(129))
      await expect(providerEncryptionKeyForInstallation(userData)).rejects.toThrow('provider encryption key is invalid')
    } finally {
      await rm(userData, { recursive: true, force: true })
    }
  })

  it('converges concurrent creation on the same private key', async () => {
    const userData = await mkdtemp(join(tmpdir(), 'paperbridge-user-data-'))
    try {
      const keys = await Promise.all(Array.from({ length: 8 }, () => providerEncryptionKeyForInstallation(userData)))
      expect(new Set(keys)).toHaveLength(1)
      expect((await stat(join(userData, 'paperbridge-provider-encryption-key'))).mode & 0o777).toBe(0o600)
    } finally {
      await rm(userData, { recursive: true, force: true })
    }
  })
})
