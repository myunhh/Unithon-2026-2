import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { createPrivateTextFile, readVerifiedPrivateTextFile } from './private-installation-file.js'

const providerEncryptionKeyFileName = 'paperbridge-provider-encryption-key'
const providerEncryptionKeyPattern = /^base64url:[A-Za-z0-9_-]{43}$/

function isProviderEncryptionKey(value: string): boolean {
  return providerEncryptionKeyPattern.test(value)
}

async function readExistingProviderEncryptionKey(file: string): Promise<string | undefined> {
  let contents: string | undefined
  try {
    contents = await readVerifiedPrivateTextFile(file, 128)
  } catch {
    throw new Error('The installed PaperBridge provider encryption key is invalid.')
  }
  if (contents === undefined) return undefined
  const existing = contents.trim()
  if (!isProviderEncryptionKey(existing)) {
    throw new Error('The installed PaperBridge provider encryption key is invalid.')
  }
  return existing
}

/** A packaged install always owns a dedicated on-disk provider encryption key. */
export async function providerEncryptionKeyForInstallation(userDataDirectory: string): Promise<string> {
  const file = join(userDataDirectory, providerEncryptionKeyFileName)
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const existing = await readExistingProviderEncryptionKey(file)
    if (existing) return existing

    const key = `base64url:${randomBytes(32).toString('base64url')}`
    try {
      if (await createPrivateTextFile(file, `${key}\n`)) return key
    } catch {
      throw new Error('The installed PaperBridge provider encryption key is invalid.')
    }
  }
  throw new Error('The installed PaperBridge provider encryption key is invalid.')
}
