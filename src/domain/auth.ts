export type AuthProfile = Readonly<{
  email: string
  createdAt: string | null
  lastSignInAt: string | null
}>

export type SignupResponse = Readonly<{
  user: AuthProfile
  emailConfirmationRequired: boolean
}>

export type AuthFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export class AuthInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AuthInputError'
  }
}

export class AuthResponseError extends Error {
    constructor(message = 'PaperBridge가 올바르지 않은 계정 응답을 받았습니다.') {
    super(message)
    this.name = 'AuthResponseError'
  }
}

export class AuthRequestError extends Error {
    constructor(message = 'PaperBridge가 계정 요청을 완료하지 못했습니다.') {
    super(message)
    this.name = 'AuthRequestError'
  }
}

/**
 * The renderer deliberately sees only a public profile. HTTP-only cookies are
 * sent by the browser with same-origin requests and are never read here.
 */
export function createAuthClient(fetcher: AuthFetch = fetch) {
  return {
    async getSession(signal?: AbortSignal): Promise<AuthProfile | null> {
      const response = await request(fetcher, '/api/auth/session', { method: 'GET', signal })
      return parseSessionEnvelope(await readJson(response))
    },

    async login(input: Readonly<{ email: string; password: string }>, signal?: AbortSignal): Promise<AuthProfile> {
      validateCredentials(input)
      const response = await request(fetcher, '/api/auth/login', {
        method: 'POST',
        signal,
        body: JSON.stringify({ email: input.email, password: input.password }),
      })
      return parseUserEnvelope(await readJson(response))
    },

    async signup(input: Readonly<{ email: string; password: string }>, signal?: AbortSignal): Promise<SignupResponse> {
      validateCredentials(input)
      const response = await request(fetcher, '/api/auth/signup', {
        method: 'POST',
        signal,
        body: JSON.stringify({ email: input.email, password: input.password }),
      })
      return parseSignupEnvelope(await readJson(response))
    },

    async updatePassword(password: string, signal?: AbortSignal): Promise<void> {
      if (!isPassword(password)) throw new AuthInputError('비밀번호는 10~128자로 입력하세요.')
      const response = await request(fetcher, '/api/auth/password', {
        method: 'PUT',
        signal,
        body: JSON.stringify({ password }),
      })
      const body = await readJson(response)
      if (!isRecord(body) || !hasOnlyKeys(body, ['updated']) || body.updated !== true) throw new AuthResponseError()
    },

    async logout(signal?: AbortSignal): Promise<void> {
      const response = await request(fetcher, '/api/auth/session', { method: 'DELETE', signal })
      if (response.status !== 204) throw new AuthResponseError()
    },
  }
}

export const authClient = createAuthClient()

export function validateCredentials(input: Readonly<{ email: string; password: string }>): void {
  if (!isEmail(input.email)) throw new AuthInputError('올바른 이메일 주소를 입력하세요.')
  if (!isPassword(input.password)) throw new AuthInputError('비밀번호는 10~128자로 입력하세요.')
}

async function request(fetcher: AuthFetch, url: string, init: RequestInit): Promise<Response> {
  const response = await fetcher(url, {
    ...init,
    credentials: 'same-origin',
    headers: {
      accept: 'application/json',
      ...(init.body ? { 'content-type': 'application/json' } : {}),
    },
  })
  if (!response.ok) throw new AuthRequestError()
  return response
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    throw new AuthResponseError()
  }
}

function parseSessionEnvelope(value: unknown): AuthProfile | null {
  if (!isRecord(value) || !hasOnlyKeys(value, ['user'])) throw new AuthResponseError()
  if (value.user === null) return null
  return parseProfile(value.user)
}

function parseUserEnvelope(value: unknown): AuthProfile {
  if (!isRecord(value) || !hasOnlyKeys(value, ['user'])) throw new AuthResponseError()
  return parseProfile(value.user)
}

function parseSignupEnvelope(value: unknown): SignupResponse {
  if (!isRecord(value) || !hasOnlyKeys(value, ['user', 'emailConfirmationRequired']) || typeof value.emailConfirmationRequired !== 'boolean') {
    throw new AuthResponseError()
  }
  return { user: parseProfile(value.user), emailConfirmationRequired: value.emailConfirmationRequired }
}

function parseProfile(value: unknown): AuthProfile {
  if (!isRecord(value) || !hasOnlyKeys(value, ['email', 'createdAt', 'lastSignInAt']) || !isEmail(value.email) || !isTimestampOrNull(value.createdAt) || !isTimestampOrNull(value.lastSignInAt)) {
    throw new AuthResponseError()
  }
  return { email: value.email, createdAt: value.createdAt, lastSignInAt: value.lastSignInAt }
}

function isEmail(value: unknown): value is string {
  return typeof value === 'string'
    && value.length >= 3
    && value.length <= 320
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function isPassword(value: unknown): value is string {
  return typeof value === 'string' && Array.from(value).length >= 10 && Array.from(value).length <= 128
}

function isTimestampOrNull(value: unknown): value is string | null {
  return value === null || (typeof value === 'string' && value.length <= 64 && Number.isFinite(Date.parse(value)))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key))
}
