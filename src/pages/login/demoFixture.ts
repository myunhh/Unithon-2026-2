import type { LoginMode } from './validation'

export type DemoOutcome =
  | Readonly<{
      readonly kind: 'retryable_error'
      readonly message: string
    }>
  | Readonly<{
      readonly kind: 'success'
      readonly message: string
    }>

export type DemoAttempt = Readonly<{
  readonly mode: LoginMode
  readonly attempt: number
}>

export function runLoginDemo({ mode, attempt }: DemoAttempt): DemoOutcome {
  if (attempt === 1) {
    return {
      kind: 'retryable_error',
      message: '데모 연결을 준비하지 못했습니다. 요청은 전송되지 않았습니다.',
    }
  }

  return {
    kind: 'success',
    message: mode === 'login'
      ? '로그인 데모를 완료했습니다. 실제 계정이나 세션은 생성되지 않았습니다.'
      : '가입 데모를 완료했습니다. 실제 계정이나 세션은 생성되지 않았습니다.',
  }
}
