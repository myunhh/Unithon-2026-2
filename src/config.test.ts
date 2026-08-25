import { describe, expect, it } from 'vitest'
import {
  parsePublicFrontendConfig,
  PublicFrontendConfigError,
  PUBLIC_API_ENV_KEY,
} from './config'

function expectConfigError(
  environment: Readonly<Record<string, unknown>>,
  code: PublicFrontendConfigError['code'],
): PublicFrontendConfigError {
  try {
    parsePublicFrontendConfig(environment)
  } catch (error: unknown) {
    if (error instanceof PublicFrontendConfigError) {
      expect(error.code).toBe(code)
      return error
    }
    throw error
  }

  throw new Error('Expected public frontend configuration parsing to fail.')
}

describe('public frontend configuration parser', () => {
  it('accepts the same-origin compatibility API path', () => {
    // Given a public environment configured for the existing relative API calls
    const environment = { [PUBLIC_API_ENV_KEY]: '/api' }

    // When the public frontend configuration is parsed
    const config = parsePublicFrontendConfig(environment)

    // Then the single typed surface exposes the configured API base
    expect(config).toEqual({ apiBaseUrl: '/api' })
  })

  it('accepts an absolute OpenAPI-oriented HTTPS API URL', () => {
    // Given a public environment configured for a deployed API
    const environment = { [PUBLIC_API_ENV_KEY]: 'https://api.example.invalid/v1' }

    // When the public frontend configuration is parsed
    const config = parsePublicFrontendConfig(environment)

    // Then the API base is preserved without exposing any other environment data
    expect(config).toEqual({ apiBaseUrl: 'https://api.example.invalid/v1' })
  })

  it('rejects a missing public API URL with a stable safe error', () => {
    // Given a public environment without the required configuration
    const environment = {}

    // When parsing is attempted
    const error = expectConfigError(environment, 'missing_api_url')

    // Then only the public key and safe failure category are exposed
    expect(error.message).toContain(PUBLIC_API_ENV_KEY)
    expect(error.message).not.toContain('undefined')
  })

  it('rejects a malformed public API URL with a stable safe error', () => {
    // Given a public environment with a value that is not an API URL
    const environment = { [PUBLIC_API_ENV_KEY]: 'not a URL' }

    // When parsing is attempted
    const error = expectConfigError(environment, 'invalid_api_url')

    // Then the diagnostic never echoes the malformed value
    expect(error.message).toContain(PUBLIC_API_ENV_KEY)
    expect(error.message).not.toContain('not a URL')
  })

  it('does not treat the OpenAPI path as a relative proxy target', () => {
    // Given a relative value that is not served by the preserved compatibility proxy
    const environment = { [PUBLIC_API_ENV_KEY]: '/v1' }

    // When parsing is attempted
    const error = expectConfigError(environment, 'invalid_api_url')

    // Then the target must be absolute before the OpenAPI path is accepted
    expect(error.message).toContain(PUBLIC_API_ENV_KEY)
  })

  it('redacts secret-like input from malformed URL errors', () => {
    // Given a malformed URL containing a diagnostic-only sensitive marker
    const rawValue = 'https://api.example.invalid/v1?input=PUBLIC_CONFIG_INPUT_SHOULD_NOT_APPEAR'

    // When parsing is attempted
    const error = expectConfigError({ [PUBLIC_API_ENV_KEY]: rawValue }, 'invalid_api_url')

    // Then neither the complete value nor its marker is present in the error
    expect(error.message).not.toContain(rawValue)
    expect(error.message).not.toContain('PUBLIC_CONFIG_INPUT_SHOULD_NOT_APPEAR')
    expect(String(error)).not.toContain(rawValue)
    expect(String(error)).not.toContain('PUBLIC_CONFIG_INPUT_SHOULD_NOT_APPEAR')
  })
})
