import { describe, expect, it } from 'vitest'
import {
  firstInvalidLoginField,
  isLoginDraftValid,
  modeForKeyboardKey,
  validateLoginDraft,
  type LoginDraft,
} from './validation'

const validDraft: LoginDraft = {
  email: 'reader@example.test',
  password: 'long-enough-demo-password',
  confirmation: 'long-enough-demo-password',
}

describe('login form validation', () => {
  it('accepts a valid login draft without requiring a server request', () => {
    expect(validateLoginDraft('login', validDraft)).toEqual({})
    expect(isLoginDraftValid('login', validDraft)).toBe(true)
  })

  it('reports email and password errors in focus order', () => {
    const errors = validateLoginDraft('login', {
      email: 'not-an-email',
      password: 'short',
      confirmation: '',
    })

    expect(errors).toEqual({
      email: '올바른 이메일 주소를 입력하세요.',
      password: '비밀번호는 10~128자로 입력하세요.',
    })
    expect(firstInvalidLoginField(errors)).toBe('email')
  })

  it('requires matching confirmation only in signup mode', () => {
    const errors = validateLoginDraft('signup', {
      ...validDraft,
      confirmation: 'different-demo-password',
    })

    expect(errors).toEqual({ confirmation: '비밀번호 확인이 일치하지 않습니다.' })
    expect(firstInvalidLoginField(errors)).toBe('confirmation')
    expect(validateLoginDraft('login', { ...validDraft, confirmation: '' })).toEqual({})
  })
})

describe('login mode keyboard interaction', () => {
  it.each([
    ['login', 'ArrowRight', 'signup'],
    ['signup', 'ArrowLeft', 'login'],
    ['login', 'ArrowDown', 'signup'],
    ['signup', 'ArrowUp', 'login'],
    ['signup', 'Home', 'login'],
    ['login', 'End', 'signup'],
  ] as const)('moves from %s with %s to %s', (current, key, expected) => {
    expect(modeForKeyboardKey(current, key)).toBe(expected)
  })

  it('leaves the active mode unchanged for unrelated keys', () => {
    expect(modeForKeyboardKey('login', 'Tab')).toBeNull()
    expect(modeForKeyboardKey('signup', 'Escape')).toBeNull()
  })
})
