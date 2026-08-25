import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

import {
  DEFAULT_BACKEND_TARGET_ROOTS,
  DEFAULT_BACKEND_ROOTS,
  DEFAULT_DESKTOP_ROOTS,
  DEFAULT_FORBIDDEN_ROOTS,
  formatBoundaryReport,
  ImportBoundaryConfigurationError,
  verifyImportBoundary,
} from './verifier.mjs'

export {
  DEFAULT_BACKEND_TARGET_ROOTS,
  DEFAULT_BACKEND_ROOTS,
  DEFAULT_DESKTOP_ROOTS,
  DEFAULT_FORBIDDEN_ROOTS,
  formatBoundaryReport,
  ImportBoundaryConfigurationError,
  verifyImportBoundary,
}

function isEntrypoint() {
  const scriptPath = process.argv[1]
  return scriptPath !== undefined && import.meta.url === pathToFileURL(resolve(scriptPath)).href
}

function runCli() {
  const argumentsList = process.argv.slice(2)
  const rootDir = argumentsList.find((value) => !value.startsWith('--')) ?? process.cwd()
  const requireArtifact = argumentsList.includes('--require-artifact')
  try {
    const result = verifyImportBoundary({ rootDir, requireArtifact })
    process.stdout.write(`${formatBoundaryReport(result)}\n`)
    return result.ok ? 0 : 1
  } catch (error) {
    if (error instanceof ImportBoundaryConfigurationError) {
      process.stderr.write(`Backend import boundary configuration error: ${error.message}\n`)
      return 2
    }
    throw error
  }
}

if (isEntrypoint()) process.exitCode = runCli()
