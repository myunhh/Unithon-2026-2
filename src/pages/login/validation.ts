export const LOGIN_MODES = ['login', 'signup'] as const

export type LoginMode = (typeof LOGIN_MODES)[number]
export type LoginField = 'email' | 'password' | 'confirmation'

export type LoginDraft = Readonly<{
  readonly email: string
  readonly password: string
  readonly confirmation: string
}>

export type LoginErrors = Partial<Record<LoginField, string>>

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateLoginDraft(mode: LoginMode, draft: LoginDraft): LoginErrors {
  const errors: LoginErrors = {}

  if (!emailPattern.test(draft.email.trim()) || draft.email.length > 254) {
    errors.email = '올바른 이메일 주소를 입력하세요.'
  }

  const passwordLength = Array.from(draft.password).length
  if (passwordLength < 10 || passwordLength > 128) {
    errors.password = '비밀번호는 10~128자로 입력하세요.'
  }

  if (mode === 'signup' && draft.password !== draft.confirmation) {
    errors.confirmation = '비밀번호 확인이 일치하지 않습니다.'
  }

  return errors
}

export function firstInvalidLoginField(errors: LoginErrors): LoginField | null {
  if (errors.email) return 'email'
  if (errors.password) return 'password'
  if (errors.confirmation) return 'confirmation'
  return null
}

export function isLoginDraftValid(mode: LoginMode, draft: LoginDraft): boolean {
  return firstInvalidLoginField(validateLoginDraft(mode, draft)) === null
}

export function modeForKeyboardKey(current: LoginMode, key: string): LoginMode | null {
  switch (key) {
    case 'ArrowRight':
    case 'ArrowDown':
      return current === 'login' ? 'signup' : 'login'
    case 'ArrowLeft':
    case 'ArrowUp':
      return current === 'signup' ? 'login' : 'signup'
    case 'Home':
      return 'login'
    case 'End':
      return 'signup'
    default:
      return null
  }
}
