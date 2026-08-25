import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const backendRoot = resolve(import.meta.dirname, '..')

const applicationPackages = ['apps/api', 'apps/worker'] as const
const libraryPackages = [
  'packages/contracts',
  'packages/domain',
  'packages/db',
  'packages/storage',
  'packages/queue',
  'packages/pdf',
  'packages/providers',
  'packages/security',
  'packages/observability',
] as const
const backendPackages = [...applicationPackages, ...libraryPackages] as const

type JsonRecord = Readonly<Record<string, unknown>>

function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readManifest(packagePath: string): JsonRecord {
  const value: unknown = JSON.parse(
    readFileSync(resolve(backendRoot, packagePath, 'package.json'), 'utf8'),
  )
  if (!isJsonRecord(value)) throw new Error(`invalid package manifest: ${packagePath}`)
  return value
}

function requiredRecord(value: unknown, label: string): JsonRecord {
  if (!isJsonRecord(value)) throw new Error(`invalid ${label}`)
  return value
}

describe('backend workspace boundary', () => {
  it('declares the backend workspace and backend-owned package manifests', () => {
    const rootManifest = readManifest('.')
    expect(rootManifest['workspaces']).toEqual(['apps/*', 'packages/*'])

    const packageNames = backendPackages.map((packagePath) => {
      const manifest = readManifest(packagePath)
      const scripts = requiredRecord(manifest['scripts'], `${packagePath} scripts`)

      expect(manifest['private']).toBe(true)
      expect(manifest['type']).toBe('module')
      expect(scripts['build']).toBe('tsc --project tsconfig.json')
      expect(scripts['typecheck']).toBe('tsc --project tsconfig.json --noEmit')

      return manifest['name']
    })

    expect(new Set(packageNames).size).toBe(backendPackages.length)
    expect(packageNames).not.toContain('paperbridge')
  })

  it.each(backendPackages)('builds %s as an independent package', (packagePath) => {
    const output = execFileSync('npm', ['run', 'build', '--prefix', packagePath], {
      cwd: backendRoot,
      encoding: 'utf8',
    })

    expect(output).toContain('tsc --project tsconfig.json')
  })
})
