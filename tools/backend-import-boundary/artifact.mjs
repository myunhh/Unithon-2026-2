import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'

import { ImportBoundaryConfigurationError } from './errors.mjs'

function relativePath(rootDir, targetPath) {
  return relative(rootDir, targetPath).split(sep).join('/')
}

function collectAllFiles(directory) {
  const files = []
  const visit = (currentDirectory) => {
    for (const entry of readdirSync(currentDirectory, { withFileTypes: true })) {
      const entryPath = join(currentDirectory, entry.name)
      if (entry.isDirectory()) visit(entryPath)
      else if (entry.isFile()) files.push(entryPath)
    }
  }
  visit(directory)
  return files.sort()
}

function configPathIsBackend(value, backendRoots) {
  if (typeof value !== 'string') return false
  const normalized = value.replaceAll('\\', '/').replace(/^\.\//, '')
  return backendRoots.some(({ root }) => normalized === root || normalized.startsWith(`${root}/`))
}

function inspectBuildConfig(rootDir, backendRoots) {
  const configPath = resolve(rootDir, 'tsconfig.electron.build.json')
  if (!existsSync(configPath)) return { status: 'not-found', forbiddenIncludes: [] }
  let config
  try {
    config = JSON.parse(readFileSync(configPath, 'utf8'))
  } catch {
    throw new ImportBoundaryConfigurationError('Electron build configuration is not valid JSON')
  }
  const include = Array.isArray(config.include) ? config.include : []
  return {
    status: 'checked',
    forbiddenIncludes: include.filter((value) => configPathIsBackend(value, backendRoots)),
  }
}

function inspectArtifact(rootDir, artifactRoot, backendRoots) {
  const artifactPath = resolve(rootDir, artifactRoot)
  if (!existsSync(artifactPath) || !statSync(artifactPath).isDirectory()) {
    return { status: 'not-built', forbiddenFiles: [] }
  }
  const forbiddenRoots = new Set(backendRoots.map(({ root }) => root))
  const forbiddenFiles = collectAllFiles(artifactPath)
    .map((filePath) => relativePath(artifactPath, filePath))
    .filter((filePath) => forbiddenRoots.has(filePath.split('/')[0]))
  return { status: 'checked', forbiddenFiles }
}

export function inspectElectronBuild(rootDir, artifactRoot, backendRoots) {
  return {
    buildConfig: inspectBuildConfig(rootDir, backendRoots),
    artifact: inspectArtifact(rootDir, artifactRoot, backendRoots),
  }
}
