import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const AES_256_KEY_BYTES = 32
const GCM_IV_BYTES = 12
const GCM_TAG_BYTES = 16
const MAX_API_KEY_BYTES = 1024
const MASTER_KEY_PREFIX = 'base64url:'

export type EncryptedProviderKeyEnvelope = Readonly<{
  /** Envelope format version; increment this before changing any field semantics. */
  v: 1
  alg: 'A256GCM'
  iv: string
  ciphertext: string
  tag: string
}>

/**
 * A safe configuration representation is `base64url:<43 base64url chars>`.
 * It decodes to exactly 32 random bytes. Raw passphrases and padded/base64
 * variants are rejected so deployment configuration is unambiguous.
 */
export function parseProviderMasterKey(value: string): Buffer {
  if (!value.startsWith(MASTER_KEY_PREFIX)) {
    throw new ProviderCredentialCryptoError('The provider master key configuration is invalid.')
  }

  const encoded = value.slice(MASTER_KEY_PREFIX.length)
  if (!/^[A-Za-z0-9_-]{43}$/.test(encoded)) {
    throw new ProviderCredentialCryptoError('The provider master key configuration is invalid.')
  }

  const decoded = Buffer.from(encoded, 'base64url')
  // Node accepts non-canonical unused bits in the final base64url character.
  // Re-encoding proves this is the single unambiguous textual representation.
  if (decoded.byteLength !== AES_256_KEY_BYTES || decoded.toString('base64url') !== encoded) {
    throw new ProviderCredentialCryptoError('The provider master key configuration is invalid.')
  }
  return Buffer.from(decoded)
}

export function validateProviderApiKey(apiKey: string): void {
  if (
    typeof apiKey !== 'string' ||
    apiKey.length === 0 ||
    Buffer.byteLength(apiKey, 'utf8') > MAX_API_KEY_BYTES ||
    hasAsciiControlCharacter(apiKey)
  ) {
    throw new ProviderCredentialCryptoError('The provider key is invalid.')
  }
}

export class ProviderCredentialCryptoError extends Error {
  readonly code = 'provider_credential_crypto_error'

  constructor(message = 'Provider credentials cannot be processed.') {
    super(message)
    this.name = 'ProviderCredentialCryptoError'
  }

  toJSON() {
    return { code: this.code, message: this.message }
  }
}

/** Encrypts individual provider keys; the session id is authenticated AAD. */
export class ProviderCredentialCipher {
  readonly #masterKey: Buffer

  constructor(masterKey: Uint8Array | string) {
    if (typeof masterKey === 'string') {
      this.#masterKey = parseProviderMasterKey(masterKey)
      return
    }
    if (masterKey.byteLength !== AES_256_KEY_BYTES) {
      throw new ProviderCredentialCryptoError('The provider master key configuration is invalid.')
    }
    this.#masterKey = Buffer.from(masterKey)
  }

  encrypt(sessionId: string, apiKey: string): EncryptedProviderKeyEnvelope {
    assertSessionId(sessionId)
    validateProviderApiKey(apiKey)

    try {
      const iv = randomBytes(GCM_IV_BYTES)
      const cipher = createCipheriv('aes-256-gcm', this.#masterKey, iv, { authTagLength: GCM_TAG_BYTES })
      cipher.setAAD(Buffer.from(sessionId, 'utf8'), { plaintextLength: Buffer.byteLength(apiKey, 'utf8') })
      const ciphertext = Buffer.concat([cipher.update(apiKey, 'utf8'), cipher.final()])
      return {
        v: 1,
        alg: 'A256GCM',
        iv: iv.toString('base64url'),
        ciphertext: ciphertext.toString('base64url'),
        tag: cipher.getAuthTag().toString('base64url'),
      }
    } catch (error) {
      if (error instanceof ProviderCredentialCryptoError) throw error
      throw new ProviderCredentialCryptoError()
    }
  }

  decrypt(sessionId: string, envelope: unknown): string {
    assertSessionId(sessionId)
    const parsed = parseEnvelope(envelope)
    try {
      const decipher = createDecipheriv('aes-256-gcm', this.#masterKey, parsed.iv, {
        authTagLength: GCM_TAG_BYTES,
      })
      decipher.setAAD(Buffer.from(sessionId, 'utf8'), { plaintextLength: parsed.ciphertext.byteLength })
      decipher.setAuthTag(parsed.tag)
      const plaintext = Buffer.concat([decipher.update(parsed.ciphertext), decipher.final()]).toString('utf8')
      validateProviderApiKey(plaintext)
      return plaintext
    } catch (error) {
      if (error instanceof ProviderCredentialCryptoError) throw error
      // Do not expose OpenSSL detail: it can reveal envelope structure and is
      // not useful to a client that must re-enter its own credential anyway.
      throw new ProviderCredentialCryptoError('Provider credentials cannot be read.')
    }
  }
}

function assertSessionId(sessionId: string): void {
  if (typeof sessionId !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(sessionId)) {
    throw new ProviderCredentialCryptoError('The provider session is invalid.')
  }
}

function parseEnvelope(value: unknown): {
  iv: Buffer
  ciphertext: Buffer
  tag: Buffer
} {
  if (!isRecord(value) || value.v !== 1 || value.alg !== 'A256GCM') {
    throw new ProviderCredentialCryptoError('Provider credentials cannot be read.')
  }
  if (!isBase64Url(value.iv, 16) || !isBase64Url(value.tag, 22) || !isBase64Url(value.ciphertext)) {
    throw new ProviderCredentialCryptoError('Provider credentials cannot be read.')
  }

  const iv = Buffer.from(value.iv, 'base64url')
  const tag = Buffer.from(value.tag, 'base64url')
  const ciphertext = Buffer.from(value.ciphertext, 'base64url')
  if (
    iv.byteLength !== GCM_IV_BYTES ||
    tag.byteLength !== GCM_TAG_BYTES ||
    ciphertext.byteLength < 1 ||
    ciphertext.byteLength > MAX_API_KEY_BYTES
  ) {
    throw new ProviderCredentialCryptoError('Provider credentials cannot be read.')
  }
  return { iv, tag, ciphertext }
}

function isBase64Url(value: unknown, exactLength?: number): value is string {
  return (
    typeof value === 'string' &&
    (exactLength === undefined ? value.length > 0 && value.length <= 1366 : value.length === exactLength) &&
    /^[A-Za-z0-9_-]+$/.test(value)
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasAsciiControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code < 32 || code === 127) return true
  }
  return false
}
