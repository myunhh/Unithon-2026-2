import { strict as assert } from 'node:assert'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { test } from 'node:test'

import { extractModuleSpecifiers } from './parser.mjs'
import { verifyImportBoundary } from './verify.mjs'

const toolDirectory = dirname(fileURLToPath(import.meta.url))
const fixturesDirectory = join(toolDirectory, 'fixtures')
const repositoryRoot = join(toolDirectory, '..', '..')

test('ignores import-like text inside string literals', () => {
  const source = `const docs = "import { bridge } from '../../../electron/preload'"`

  assert.deepEqual(extractModuleSpecifiers(source, 'string-fixture.ts'), [])
})

test('extracts TypeScript import-equals module references', () => {
  const source = "import server = require('../server/app.js')"

  assert.deepEqual(extractModuleSpecifiers(source, 'import-equals.ts'), [
    { kind: 'import-equals', specifier: '../server/app.js' },
  ])
})

test('keeps namespace import-equals references out of the module edge set', () => {
  const source = [
    "import type desktop = require('../../../electron/preload.mjs')",
    'import Namespace = Other.Namespace',
  ].join('\n')

  assert.deepEqual(extractModuleSpecifiers(source, 'import-equals-types.ts'), [
    { kind: 'import-equals-type', specifier: '../../../electron/preload.mjs' },
  ])
})

test('allows normal backend imports in a synthetic module graph', () => {
  const result = verifyImportBoundary({
    rootDir: join(fixturesDirectory, 'allowed'),
  })

  assert.equal(result.ok, true)
  assert.equal(result.violations.length, 0)
  assert.ok(result.scannedFiles >= 2)
})

test('rejects backend imports into Electron and renderer surfaces', () => {
  const result = verifyImportBoundary({
    rootDir: join(fixturesDirectory, 'forbidden'),
  })

  assert.equal(result.ok, false)
  assert.deepEqual(result.violations.map((violation) => violation.specifier).sort(), [
    '../../../electron/main.mjs',
    '../../../electron/preload.mjs',
    '../../../electron/preload.mjs',
    '../../../src/App.tsx',
    '@paperbridge/desktop/internal',
  ])
  assert.ok(result.violations.some((violation) => violation.importKind === 'export-type'))
  assert.ok(
    result.violations.some(
      (violation) =>
        violation.direction === 'backend-to-desktop' &&
        violation.importKind === 'import-equals' &&
        violation.specifier === '../../../electron/preload.mjs',
    ),
  )
})

test('rejects Electron imports into backend source', () => {
  const result = verifyImportBoundary({
    rootDir: join(fixturesDirectory, 'desktop-backend-coupling'),
  })

  assert.equal(result.ok, false)
  assert.ok(
    result.violations.some(
      (violation) =>
        violation.direction === 'desktop-to-backend' &&
        violation.importer === 'electron/main.mjs' &&
        violation.target === 'server/app.js',
    ),
  )
  assert.ok(
    result.violations.some(
      (violation) =>
        violation.direction === 'desktop-to-backend' &&
        violation.importer === 'electron/import-equals.ts' &&
        violation.importKind === 'import-equals' &&
        violation.target === 'server/app.js',
    ),
  )
})

test('rejects Electron build config includes and backend artifact output', () => {
  const result = verifyImportBoundary({
    rootDir: join(fixturesDirectory, 'forbidden-build-output'),
  })

  assert.equal(result.ok, false)
  assert.ok(
    result.violations.some(
      (violation) =>
        violation.direction === 'desktop-build-config' &&
        violation.importKind === 'include' &&
        violation.specifier === 'server',
    ),
  )
  assert.ok(
    result.violations.some(
      (violation) =>
        violation.direction === 'desktop-artifact' &&
        violation.importKind === 'artifact-file' &&
        violation.target === 'server/app.js',
    ),
  )
})

test('passes the current BE-004 backend tree', () => {
  const result = verifyImportBoundary({ rootDir: repositoryRoot })

  assert.equal(result.ok, true)
  assert.equal(result.violations.length, 0)
  assert.ok(result.scannedFiles > 0)
  assert.ok(result.importEdges > 0)
})
