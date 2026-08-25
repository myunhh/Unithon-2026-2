import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { directExecutableExtensions, discoverExecutableOnPath } from './executable.js'

describe('Windows executable discovery', () => {
  it('rejects command shims but falls back to a direct executable in PATH', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'paperbridge-agent-runtime-'))
    try {
      await writeFile(join(directory, 'agy.CMD'), '@echo off\r\n')
      expect(await discoverExecutableOnPath('agy', directory, { platform: 'win32' })).toEqual({
        unsupportedWindowsShim: true,
      })

      await writeFile(join(directory, 'agy.EXE'), 'native executable placeholder')
      expect(await discoverExecutableOnPath('agy', directory, { platform: 'win32' })).toEqual({
        executablePath: join(directory, 'agy.EXE'),
        unsupportedWindowsShim: false,
      })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('limits Windows candidates to direct executable formats', () => {
    expect(directExecutableExtensions('win32')).toEqual(['.EXE', '.COM'])
  })
})
