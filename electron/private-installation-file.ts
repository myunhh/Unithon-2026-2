import { constants } from 'node:fs'
import { lstat, mkdir, open } from 'node:fs/promises'
import { dirname } from 'node:path'

const privateFileMode = 0o600

export class PrivateInstallationFileError extends Error {
  constructor() {
    super('The installed PaperBridge private file is invalid.')
    this.name = 'PrivateInstallationFileError'
  }
}

function noFollowFlag(): number {
  // Windows does not implement O_NOFOLLOW. The opened handle is still compared
  // to an lstat result before any contents are read, which closes that race on
  // platforms without the flag as well.
  return process.platform === 'win32' ? 0 : constants.O_NOFOLLOW
}

function sameFile(left: { dev: number; ino: number }, right: { dev: number; ino: number }): boolean {
  return left.dev === right.dev && left.ino === right.ino
}

/**
 * Reads a small private file through a pinned descriptor. No data is read until
 * its descriptor is proven to match a non-symlink directory entry.
 */
export async function readVerifiedPrivateTextFile(file: string, maximumBytes: number): Promise<string | undefined> {
  let handle
  try {
    handle = await open(file, constants.O_RDONLY | noFollowFlag())
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw new PrivateInstallationFileError()
  }

  try {
    const details = await handle.stat()
    if (!details.isFile() || details.size > maximumBytes) throw new PrivateInstallationFileError()

    let entry
    try {
      entry = await lstat(file)
    } catch {
      throw new PrivateInstallationFileError()
    }
    if (!entry.isFile() || entry.isSymbolicLink() || !sameFile(details, entry)) {
      throw new PrivateInstallationFileError()
    }

    await handle.chmod(privateFileMode)
    return await handle.readFile({ encoding: 'utf8' })
  } catch (error) {
    if (error instanceof PrivateInstallationFileError) throw error
    throw new PrivateInstallationFileError()
  } finally {
    await handle.close()
  }
}

/** Atomically creates one owner-only private file without following its final path. */
export async function createPrivateTextFile(file: string, value: string): Promise<boolean> {
  await mkdir(dirname(file), { recursive: true, mode: 0o700 })

  let handle
  try {
    handle = await open(file, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | noFollowFlag(), privateFileMode)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false
    throw new PrivateInstallationFileError()
  }

  try {
    const details = await handle.stat()
    if (!details.isFile()) throw new PrivateInstallationFileError()
    await handle.chmod(privateFileMode)
    await handle.writeFile(value, 'utf8')
    return true
  } catch (error) {
    if (error instanceof PrivateInstallationFileError) throw error
    throw new PrivateInstallationFileError()
  } finally {
    await handle.close()
  }
}
