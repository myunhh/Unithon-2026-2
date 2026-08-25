import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, extname, join, relative, resolve, sep } from 'node:path'

import { inspectElectronBuild } from './artifact.mjs'
import { ImportBoundaryConfigurationError } from './errors.mjs'
import { extractModuleSpecifiers } from './parser.mjs'

export { ImportBoundaryConfigurationError } from './errors.mjs'

export const DEFAULT_BACKEND_ROOTS = Object.freeze(['apps/api', 'apps/worker', 'packages', 'server'])
export const DEFAULT_DESKTOP_ROOTS = Object.freeze(['electron'])
export const DEFAULT_FORBIDDEN_ROOTS = Object.freeze([
  Object.freeze({ root: 'electron', surface: 'electron' }),
  Object.freeze({ root: 'src', surface: 'renderer' }),
  Object.freeze({ root: 'dist-electron', surface: 'packaged-desktop' }),
  Object.freeze({ root: 'desktop', surface: 'packaged-desktop' }),
])
export const DEFAULT_BACKEND_TARGET_ROOTS = Object.freeze([
  Object.freeze({ root: 'apps', surface: 'backend' }),
  Object.freeze({ root: 'packages', surface: 'backend' }),
  Object.freeze({ root: 'server', surface: 'backend' }),
])

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'])
const EXTENSION_SUBSTITUTIONS = new Map([
  ['.js', ['.ts', '.tsx', '.js']],
  ['.jsx', ['.tsx', '.ts', '.jsx']],
  ['.mjs', ['.mts', '.ts', '.mjs']],
  ['.cjs', ['.cts', '.ts', '.cjs']],
])
const FORBIDDEN_PACKAGE_PATTERNS = [
  [/^(?:electron|@electron)(?:\/|$)/, 'electron'],
  [/^@paperbridge\/electron(?:\/|$)/, 'electron'],
  [/^@paperbridge\/(?:desktop|renderer)(?:\/|$)/, 'packaged-desktop'],
  [/^(?:src|renderer)(?:\/|$)/, 'renderer'],
  [/^(?:desktop|dist-electron)(?:\/|$)/, 'packaged-desktop'],
]

function normalizeRoot(rootDir) {
  const normalized = resolve(rootDir ?? process.cwd())
  if (!existsSync(normalized) || !statSync(normalized).isDirectory()) {
    throw new ImportBoundaryConfigurationError('repository root does not exist')
  }
  return normalized
}

function collectFiles(rootDir, roots, extensions) {
  const files = []
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const entryPath = join(directory, entry.name)
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules' && entry.name !== '.git') visit(entryPath)
      } else if (entry.isFile() && extensions.has(extname(entry.name))) {
        files.push(entryPath)
      }
    }
  }

  for (const root of roots) {
    const rootPath = resolve(rootDir, root)
    if (existsSync(rootPath) && statSync(rootPath).isDirectory()) visit(rootPath)
  }
  return files.sort()
}

function candidatesFor(basePath) {
  const extension = extname(basePath)
  const candidates = extension
    ? [basePath, ...(EXTENSION_SUBSTITUTIONS.get(extension) ?? []).map((value) => `${basePath.slice(0, -extension.length)}${value}`)]
    : [basePath, ...[...SOURCE_EXTENSIONS].map((value) => `${basePath}${value}`)]
  if (!extension) candidates.push(...[...SOURCE_EXTENSIONS].map((value) => join(basePath, `index${value}`)))
  return [...new Set(candidates)]
}

function resolveExisting(candidates) {
  return candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile())
}

function relativePath(rootDir, targetPath) {
  return relative(rootDir, targetPath).split(sep).join('/')
}

function surfaceForSpecifier(specifier, patterns) {
  return patterns.find(([pattern]) => pattern.test(specifier))?.[1]
}

function surfaceForPath(rootDir, targetPath, forbiddenRoots) {
  const targetRelativePath = relativePath(rootDir, targetPath)
  const firstSegment = targetRelativePath.split('/')[0]
  return forbiddenRoots.find(({ root }) => firstSegment === root)?.surface
}

function localTargetForBareSpecifier(rootDir, specifier) {
  if (specifier.startsWith('@paperbridge/')) {
    const [, packageName, ...subpath] = specifier.split('/')
    if (!packageName) return undefined
    const packageRoot = join(rootDir, 'packages', packageName)
    return subpath.length > 0 ? join(packageRoot, ...subpath) : join(packageRoot, 'src', 'index.ts')
  }
  const [rootName, ...subpath] = specifier.split('/')
  if (['apps', 'packages', 'server', 'src', 'electron', 'desktop', 'dist-electron'].includes(rootName)) {
    return join(rootDir, rootName, ...subpath)
  }
  return undefined
}

function inspectEdge(context, edge) {
  const { rootDir, importer, forbiddenRoots, forbiddenPackagePatterns } = context
  const directSurface = surfaceForSpecifier(edge.specifier, forbiddenPackagePatterns)
  if (directSurface) return { surface: directSurface, target: undefined }

  const isRelative = edge.specifier.startsWith('.') || edge.specifier.startsWith('/')
  const bareTarget = isRelative ? undefined : localTargetForBareSpecifier(rootDir, edge.specifier)
  if (!isRelative && bareTarget === undefined) return undefined

  const basePath = isRelative
    ? edge.specifier.startsWith('/')
      ? resolve(rootDir, edge.specifier.slice(1))
      : resolve(dirname(importer), edge.specifier)
    : bareTarget
  const candidates = candidatesFor(basePath)
  const target = resolveExisting(candidates) ?? candidates[0]
  if (target === undefined) return undefined
  const surface = surfaceForPath(rootDir, target, forbiddenRoots)
  return surface ? { surface, target } : undefined
}

function scanDirection(context) {
  const violations = []
  let importEdges = 0
  for (const importer of context.sourceFiles) {
    const source = readFileSync(importer, 'utf8')
    const importerContext = { ...context, importer }
    for (const edge of extractModuleSpecifiers(source, importer)) {
      importEdges += 1
      const inspected = inspectEdge(importerContext, edge)
      if (inspected === undefined) continue
      violations.push({
        direction: context.direction,
        importer: relativePath(context.rootDir, importer),
        importKind: edge.kind,
        specifier: edge.specifier,
        target: inspected.target === undefined ? null : relativePath(context.rootDir, inspected.target),
        surface: inspected.surface,
      })
    }
  }
  return { importEdges, violations }
}

export function verifyImportBoundary(options = {}) {
  const rootDir = normalizeRoot(options.rootDir)
  const backendRoots = options.backendRoots ?? DEFAULT_BACKEND_ROOTS
  const desktopRoots = options.desktopRoots ?? DEFAULT_DESKTOP_ROOTS
  const desktopForbiddenRoots = options.forbiddenRoots ?? DEFAULT_FORBIDDEN_ROOTS
  const backendTargetRoots = options.backendTargetRoots ?? DEFAULT_BACKEND_TARGET_ROOTS
  const backendFiles = collectFiles(rootDir, backendRoots, SOURCE_EXTENSIONS)
  const desktopFiles = collectFiles(rootDir, desktopRoots, SOURCE_EXTENSIONS)
  const backendToDesktop = scanDirection({
    direction: 'backend-to-desktop',
    rootDir,
    sourceFiles: backendFiles,
    forbiddenRoots: desktopForbiddenRoots,
    forbiddenPackagePatterns: FORBIDDEN_PACKAGE_PATTERNS,
  })
  const desktopToBackend = scanDirection({
    direction: 'desktop-to-backend',
    rootDir,
    sourceFiles: desktopFiles,
    forbiddenRoots: backendTargetRoots,
    forbiddenPackagePatterns: [],
  })
  const { buildConfig, artifact } = inspectElectronBuild(
    rootDir,
    options.artifactRoot ?? 'dist-electron',
    backendTargetRoots,
  )
  const violations = [...backendToDesktop.violations, ...desktopToBackend.violations]
  for (const include of buildConfig.forbiddenIncludes) {
    violations.push({
      direction: 'desktop-build-config',
      importer: 'tsconfig.electron.build.json',
      importKind: 'include',
      specifier: include,
      target: null,
      surface: 'backend-build-output',
    })
  }
  for (const file of artifact.forbiddenFiles) {
    violations.push({
      direction: 'desktop-artifact',
      importer: options.artifactRoot ?? 'dist-electron',
      importKind: 'artifact-file',
      specifier: file,
      target: file,
      surface: 'backend-build-output',
    })
  }
  if (options.requireArtifact === true && artifact.status === 'not-built') {
    violations.push({
      direction: 'desktop-artifact',
      importer: options.artifactRoot ?? 'dist-electron',
      importKind: 'artifact-missing',
      specifier: '<not-built>',
      target: null,
      surface: 'packaged-desktop',
    })
  }

  return {
    ok: violations.length === 0,
    scannedFiles: backendFiles.length,
    scannedDesktopFiles: desktopFiles.length,
    importEdges: backendToDesktop.importEdges + desktopToBackend.importEdges,
    buildConfig,
    artifact,
    violations,
  }
}

export function formatBoundaryReport(result) {
  const summary = `Scanned ${result.scannedFiles} backend modules, ${result.scannedDesktopFiles} desktop modules, and ${result.importEdges} import edges.`
  const config = `Electron build config: ${result.buildConfig.status === 'checked' ? 'CHECKED' : 'NOT FOUND'}`
  const artifact = `Electron artifact: ${result.artifact.status === 'checked' ? 'CHECKED' : 'NOT BUILT'}`
  if (result.ok) return `${summary}\n${config}\n${artifact}\nBackend/desktop boundary: PASS`
  const details = result.violations
    .map((violation) => `- ${violation.direction}: ${violation.importer} -> ${violation.specifier} [${violation.surface}]`)
    .join('\n')
  return `${summary}\n${config}\n${artifact}\nBackend/desktop boundary: FAIL (${result.violations.length} forbidden edge${result.violations.length === 1 ? '' : 's'})\n${details}`
}
