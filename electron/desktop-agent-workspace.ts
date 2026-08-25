import { constants } from 'node:fs'
import { lstat, mkdir, open, readdir, realpath } from 'node:fs/promises'
import { join, relative } from 'node:path'

const workspaceDirectoryName = 'paperbridge-agent-workspace'

function sameFile(left: { dev: number; ino: number }, right: { dev: number; ino: number }): boolean {
  return left.dev === right.dev && left.ino === right.ino
}

function workspaceOpenFlags(): number {
  // Windows lacks O_DIRECTORY/O_NOFOLLOW. The descriptor/path identity checks
  // below still reject a followed symlink before it is used there.
  return process.platform === 'win32'
    ? constants.O_RDONLY
    : constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW
}

function invalidWorkspace(): never {
  throw new Error('The desktop agent workspace is invalid.')
}

/**
 * Providers receive an empty read-only directory, never a renderer-selected
 * path. Existing contents are preserved and treated as a safety failure rather
 * than recursively deleted.
 */
export async function prepareDesktopAgentWorkspace(userDataDirectory: string): Promise<string> {
  await mkdir(userDataDirectory, { recursive: true, mode: 0o700 })
  // Work only below the canonical app-owned parent so a userData symlink cannot
  // redirect a renderer-independent workspace outside the application root.
  const canonicalUserDataDirectory = await realpath(userDataDirectory)
  const workspace = join(canonicalUserDataDirectory, workspaceDirectoryName)
  await mkdir(workspace, { recursive: true, mode: 0o700 })
  let handle
  try {
    handle = await open(workspace, workspaceOpenFlags())
  } catch {
    return invalidWorkspace()
  }

  try {
    const details = await handle.stat()
    const entry = await lstat(workspace)
    const canonicalWorkspace = await realpath(workspace)
    if (
      !details.isDirectory() ||
      !entry.isDirectory() ||
      entry.isSymbolicLink() ||
      !sameFile(details, entry) ||
      canonicalWorkspace !== workspace ||
      relative(canonicalUserDataDirectory, canonicalWorkspace) !== workspaceDirectoryName
    ) return invalidWorkspace()

    if ((await readdir(canonicalWorkspace)).length > 0) {
      throw new Error('The desktop agent workspace must be empty.')
    }

    // Re-check the pathname after reading it. chmod is issued against the
    // verified descriptor, never a path that a racing local process can swap.
    const finalEntry = await lstat(workspace)
    if (!finalEntry.isDirectory() || finalEntry.isSymbolicLink() || !sameFile(details, finalEntry)) return invalidWorkspace()
    // The current user retains read/execute access for cwd resolution while CLI
    // tools cannot write into the workspace.
    await handle.chmod(0o500)
    return canonicalWorkspace
  } catch (error) {
    if (error instanceof Error && error.message === 'The desktop agent workspace must be empty.') throw error
    return invalidWorkspace()
  } finally {
    await handle.close()
  }
}
