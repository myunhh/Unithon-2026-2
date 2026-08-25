import { describe, expect, it } from 'vitest'
import { buildProviderEnvironment, isProviderEnvironmentNameAllowed } from './environment.js'

describe('provider environment boundary', () => {
  it('preserves the minimal execution, cached-auth, locale, and temporary-directory variables', () => {
    const environment = buildProviderEnvironment({
      PATH: '/usr/local/bin',
      HOME: '/safe/home',
      XDG_CONFIG_HOME: '/safe/config',
      DBUS_SESSION_BUS_ADDRESS: 'unix:path=/run/user/1000/bus',
      LANG: 'en_US.UTF-8',
      LC_CTYPE: 'en_US.UTF-8',
      TMPDIR: '/safe/tmp',
      USERPROFILE: 'C:\\Users\\safe',
      APPDATA: 'C:\\Users\\safe\\AppData\\Roaming',
      SYSTEMROOT: 'C:\\Windows',
      COMSPEC: 'C:\\Windows\\System32\\cmd.exe',
    })

    expect(environment).toEqual({
      PATH: '/usr/local/bin',
      HOME: '/safe/home',
      XDG_CONFIG_HOME: '/safe/config',
      DBUS_SESSION_BUS_ADDRESS: 'unix:path=/run/user/1000/bus',
      LANG: 'en_US.UTF-8',
      LC_CTYPE: 'en_US.UTF-8',
      TMPDIR: '/safe/tmp',
      USERPROFILE: 'C:\\Users\\safe',
      APPDATA: 'C:\\Users\\safe\\AppData\\Roaming',
      SYSTEMROOT: 'C:\\Windows',
      COMSPEC: 'C:\\Windows\\System32\\cmd.exe',
    })
  })

  it('strips app secrets, provider keys, and unrelated parent variables', () => {
    const environment = buildProviderEnvironment({
      PATH: '/usr/bin',
      PAPERBRIDGE_SESSION_SECRET: 'do-not-forward',
      SUPABASE_SECRET_KEY: 'do-not-forward',
      OPENAI_API_KEY: 'do-not-forward',
      ANTHROPIC_API_KEY: 'do-not-forward',
      GOOGLE_API_KEY: 'do-not-forward',
      AWS_SECRET_ACCESS_KEY: 'do-not-forward',
      PARENT_ONLY_SETTING: 'do-not-forward',
      NODE_OPTIONS: '--require /tmp/untrusted.js',
    })

    expect(environment).toEqual({ PATH: '/usr/bin' })
    expect(isProviderEnvironmentNameAllowed('LC_SESSION')).toBe(false)
    expect(isProviderEnvironmentNameAllowed('PAPERBRIDGE_SESSION_SECRET')).toBe(false)
    expect(isProviderEnvironmentNameAllowed('OPENAI_API_KEY')).toBe(false)
  })
})
