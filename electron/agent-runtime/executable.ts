import { constants } from 'node:fs'
import { access, stat } from 'node:fs/promises'
import { delimiter, isAbsolute, join } from 'node:path'

/** Only a bare executable name may be resolved. Paths are intentionally rejected. */
export function isSafeExecutableName(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)
}

export type ExecutableDiscovery = {
  executablePath?: string
  /** A Windows command shim was found, but it is intentionally not executable with shell:false. */
  unsupportedWindowsShim: boolean
}

export type ExecutableLookupOptions = {
  platform?: NodeJS.Platform
}

export function directExecutableExtensions(platform: NodeJS.Platform = process.platform): readonly string[] {
  // .cmd and .bat require cmd.exe or shell:true. Both would weaken argv safety,
  // so Windows support intentionally requires a direct native executable.
  return platform === 'win32' ? ['.EXE', '.COM'] : ['']
}

function pathCandidates(name: string, pathValue: string | undefined, extensions: readonly string[]): string[] {
  if (!isSafeExecutableName(name) || !pathValue) return []
  return pathValue.split(delimiter).filter((directory) => directory.length > 0 && isAbsolute(directory)).flatMap((directory) =>
    extensions.map((extension) => join(directory, `${name}${extension}`)),
  )
}

async function isRunnableFile(candidate: string, platform: NodeJS.Platform): Promise<boolean> {
  try {
    await access(candidate, platform === 'win32' ? constants.F_OK : constants.X_OK)
    return (await stat(candidate)).isFile()
  } catch {
    return false
  }
}

/**
 * Resolve an executable using PATH only. It never expands a home directory,
 * consults CLI config locations, or invokes a shell helper such as `which`.
 */
export async function discoverExecutableOnPath(
  name: string,
  pathValue = process.env.PATH,
  options: ExecutableLookupOptions = {},
): Promise<ExecutableDiscovery> {
  const platform = options.platform ?? process.platform
  for (const candidate of pathCandidates(name, pathValue, directExecutableExtensions(platform))) {
    if (await isRunnableFile(candidate, platform)) return { executablePath: candidate, unsupportedWindowsShim: false }
  }

  if (platform !== 'win32') return { unsupportedWindowsShim: false }
  for (const candidate of pathCandidates(name, pathValue, ['.CMD', '.BAT'])) {
    if (await isRunnableFile(candidate, platform)) return { unsupportedWindowsShim: true }
  }
  return { unsupportedWindowsShim: false }
}

export async function findExecutableOnPath(
  name: string,
  pathValue = process.env.PATH,
  options: ExecutableLookupOptions = {},
): Promise<string | undefined> {
  return (await discoverExecutableOnPath(name, pathValue, options)).executablePath
}
