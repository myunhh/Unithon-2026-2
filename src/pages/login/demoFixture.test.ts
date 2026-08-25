import { describe, expect, it } from 'vitest'
import { runLoginDemo } from './demoFixture'

describe('login demo retry seam', () => {
  it('shows a retryable local failure first, then a local success', () => {
    const firstAttempt = runLoginDemo({ mode: 'login', attempt: 1 })
    const retryAttempt = runLoginDemo({ mode: 'login', attempt: 2 })

    expect(firstAttempt).toEqual({
      kind: 'retryable_error',
      message: '데모 연결을 준비하지 못했습니다. 요청은 전송되지 않았습니다.',
    })
    expect(retryAttempt.kind).toBe('success')
    expect(retryAttempt.message).toContain('실제 계정이나 세션은 생성되지 않았습니다.')
  })

  it('keeps signup and login outcomes visibly distinct without handling credentials', () => {
    const signupAttempt = runLoginDemo({ mode: 'signup', attempt: 2 })

    expect(signupAttempt.kind).toBe('success')
    expect(signupAttempt.message).toContain('가입 데모')
    expect(signupAttempt.message).not.toContain('비밀번호')
  })
})
