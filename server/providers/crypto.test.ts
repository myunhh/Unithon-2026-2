import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  parseProviderMasterKey,
  ProviderCredentialCipher,
  ProviderCredentialCryptoError,
} from './crypto.js'

const sessionId = '0123456789abcdefghijklmnopqrstuv'
const otherSessionId = 'zyxwvutsrqponmlkjihgfedcba987654'
const providerKey = 'sk-or-v1-this-is-a-test-key-that-must-not-leak'

function configuredMasterKey(): string {
  return `base64url:${Buffer.alloc(32, 9).toString('base64url')}`
}

describe('ProviderCredentialCipher', () => {
  it('uses the documented exact 32-byte base64url master-key representation', () => {
    expect(parseProviderMasterKey(configuredMasterKey())).toEqual(Buffer.alloc(32, 9))
    expect(() => parseProviderMasterKey(randomBytes(32).toString('hex'))).toThrow(ProviderCredentialCryptoError)
    expect(() => parseProviderMasterKey('base64url:too-short')).toThrow(ProviderCredentialCryptoError)
  })

  it('rejects non-canonical base64url text even when Node decodes it to the same key', () => {
    const canonical = Buffer.alloc(32, 9).toString('base64url')
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
    const finalIndex = alphabet.indexOf(canonical.at(-1) ?? '')
    const nonCanonical = `${canonical.slice(0, -1)}${alphabet[finalIndex + 1]}`

    expect(Buffer.from(nonCanonical, 'base64url')).toEqual(Buffer.from(canonical, 'base64url'))
    expect(() => parseProviderMasterKey(`base64url:${nonCanonical}`)).toThrow(ProviderCredentialCryptoError)
  })

  it('encrypts with a fresh IV and does not serialize plaintext', () => {
    const cipher = new ProviderCredentialCipher(configuredMasterKey())
    const first = cipher.encrypt(sessionId, providerKey)
    const second = cipher.encrypt(sessionId, providerKey)

    expect(first).not.toEqual(second)
    expect(JSON.stringify(first)).not.toContain(providerKey)
    expect(cipher.decrypt(sessionId, first)).toBe(providerKey)
  })

  it('rejects tampered envelopes and envelopes moved to a different session without exposing the key', () => {
    const cipher = new ProviderCredentialCipher(configuredMasterKey())
    const envelope = cipher.encrypt(sessionId, providerKey)
    const replacement = envelope.tag.startsWith('A') ? 'B' : 'A'
    const tampered = { ...envelope, tag: `${replacement}${envelope.tag.slice(1)}` }

    for (const attempt of [
      () => cipher.decrypt(sessionId, tampered),
      () => cipher.decrypt(otherSessionId, envelope),
    ]) {
      try {
        attempt()
        throw new Error('expected credential decryption to fail')
      } catch (error) {
        expect(error).toBeInstanceOf(ProviderCredentialCryptoError)
        expect(String(error)).not.toContain(providerKey)
        expect(JSON.stringify(error)).not.toContain(providerKey)
      }
    }
  })
})
