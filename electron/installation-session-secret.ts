import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { createPrivateTextFile, readVerifiedPrivateTextFile } from './private-installation-file.js'

const sessionSecretFileName = 'paperbridge-session-secret'
const sessionSecretPattern = /^[A-Za-z0-9_-]{32,128}$/

/** Persists the packaged-server session secret using the same private-file boundary as credentials. */
export async function sessionSecretForInstallation(userDataDirectory: string): Promise<string> {
  const file = join(userDataDirectory, sessionSecretFileName)
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let existing: string | undefined
    try {
      existing = await readVerifiedPrivateTextFile(file, 256)
    } catch {
      throw new Error('The installed PaperBridge session secret is invalid.')
    }
    if (existing !== undefined) {
      const secret = existing.trim()
      if (sessionSecretPattern.test(secret)) return secret
      throw new Error('The installed PaperBridge session secret is invalid.')
    }

    const secret = randomBytes(32).toString('base64url')
    try {
      if (await createPrivateTextFile(file, `${secret}\n`)) return secret
    } catch {
      throw new Error('The installed PaperBridge session secret is invalid.')
    }
  }
  throw new Error('The installed PaperBridge session secret is invalid.')
}
