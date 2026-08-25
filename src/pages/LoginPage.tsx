import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { AppLink } from '../routes/AppLink'
import { runLoginDemo, type DemoOutcome } from './login/demoFixture'
import {
  firstInvalidLoginField,
  modeForKeyboardKey,
  validateLoginDraft,
  type LoginDraft,
  type LoginErrors,
  type LoginField,
  type LoginMode,
} from './login/validation'
import './LoginPage.css'

type LoginPageProps = {
  onNavigate: (path: string) => void
  onAuthenticated: () => void
}

type Notice = Readonly<{
  readonly tone: 'error' | 'success'
  readonly message: string
  readonly retryable: boolean
}>

function assertNever(value: never): never {
  throw new Error(`Unexpected login demo outcome: ${String(value)}`)
}

export function LoginPage({ onNavigate }: LoginPageProps) {
  const [mode, setMode] = useState<LoginMode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [errors, setErrors] = useState<LoginErrors>({})
  const [notice, setNotice] = useState<Notice | null>(null)
  const [pending, setPending] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [lastValidDraft, setLastValidDraft] = useState<LoginDraft | null>(null)
  const runId = useRef(0)
  const noticeRef = useRef<HTMLParagraphElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)
  const confirmationRef = useRef<HTMLInputElement>(null)
  const loginTabRef = useRef<HTMLButtonElement>(null)
  const signupTabRef = useRef<HTMLButtonElement>(null)
  const tabRefs = { login: loginTabRef, signup: signupTabRef }
  const creating = mode === 'signup'

  useEffect(() => {
    if (notice) noticeRef.current?.focus()
  }, [notice])

  function focusField(field: LoginField | null): void {
    if (field === 'email') emailRef.current?.focus()
    if (field === 'password') passwordRef.current?.focus()
    if (field === 'confirmation') confirmationRef.current?.focus()
  }

  function switchMode(nextMode: LoginMode): void {
    runId.current += 1
    setMode(nextMode)
    setPassword('')
    setConfirmation('')
    setPasswordVisible(false)
    setErrors({})
    setNotice(null)
    setAttempt(0)
    setLastValidDraft(null)
    setPending(false)
    tabRefs[nextMode].current?.focus()
  }

  function handleModeKeyDown(event: KeyboardEvent<HTMLButtonElement>): void {
    const nextMode = modeForKeyboardKey(mode, event.key)
    if (!nextMode) return
    event.preventDefault()
    switchMode(nextMode)
  }

  async function completeDemo(nextMode: LoginMode, nextAttempt: number): Promise<void> {
    const currentRun = runId.current + 1
    runId.current = currentRun
    setPending(true)
    setNotice(null)
    await Promise.resolve()
    if (runId.current !== currentRun) return

    const outcome = runLoginDemo({ mode: nextMode, attempt: nextAttempt })
    setPending(false)
    handleDemoOutcome(outcome)
  }

  function handleDemoOutcome(outcome: DemoOutcome): void {
    switch (outcome.kind) {
      case 'retryable_error':
        setNotice({ tone: 'error', message: outcome.message, retryable: true })
        return
      case 'success':
        setNotice({ tone: 'success', message: outcome.message, retryable: false })
        return
      default:
        return assertNever(outcome)
    }
  }

  function submitDraft(draft: LoginDraft): void {
    setNotice(null)
    const nextErrors = validateLoginDraft(mode, draft)
    setErrors(nextErrors)
    const firstInvalidField = firstInvalidLoginField(nextErrors)
    if (firstInvalidField) {
      focusField(firstInvalidField)
      return
    }

    const nextAttempt = attempt + 1
    setAttempt(nextAttempt)
    setLastValidDraft(draft)
    void completeDemo(mode, nextAttempt)
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    if (pending) return
    submitDraft({ email, password, confirmation })
  }

  function retryDemo(): void {
    if (!lastValidDraft || pending) return
    const nextAttempt = attempt + 1
    setAttempt(nextAttempt)
    void completeDemo(mode, nextAttempt)
  }

  const emailDescription = errors.email ? 'login-email-help login-email-error' : 'login-email-help'
  const passwordDescription = errors.password
    ? 'login-password-help login-password-error'
    : 'login-password-help'
  const confirmationDescription = errors.confirmation ? 'login-confirmation-error' : undefined

  return (
    <main className="login-page" data-demo-only="true">
      <header className="login-header">
        <AppLink className="login-brand" href="/" onNavigate={onNavigate}>PaperBridge</AppLink>
        <AppLink className="login-secondary-link" href="/library" onNavigate={onNavigate}>계정 없이 계속하기</AppLink>
      </header>

      <section className="login-card" aria-labelledby="login-title">
        <aside className="login-demo-banner" aria-label="로그인 및 가입 데모">
          <div className="login-demo-banner-heading">
            <span className="login-demo-chip">데모 모드</span>
            <span>실제 요청은 전송되지 않습니다.</span>
          </div>
          <p>입력 검증, 키보드 포커스, 오류 재시도 흐름만 확인합니다.</p>
        </aside>

        <div className="login-tabs" role="tablist" aria-label="로그인 및 가입 방식">
          <button
            ref={loginTabRef}
            className="login-tab"
            id="login-tab"
            type="button"
            role="tab"
            aria-controls="login-panel"
            aria-selected={!creating}
            tabIndex={creating ? -1 : 0}
            onClick={() => switchMode('login')}
            onKeyDown={handleModeKeyDown}
          >로그인</button>
          <button
            ref={signupTabRef}
            className="login-tab"
            id="signup-tab"
            type="button"
            role="tab"
            aria-controls="login-panel"
            aria-selected={creating}
            tabIndex={creating ? 0 : -1}
            onClick={() => switchMode('signup')}
            onKeyDown={handleModeKeyDown}
          >가입</button>
        </div>

        <div className="login-panel" id="login-panel" role="tabpanel" tabIndex={0} aria-labelledby={creating ? 'signup-tab' : 'login-tab'}>
          <div className="login-heading">
            <p className="login-kicker">계정 검증</p>
            <h1 id="login-title">{creating ? '가입 검증 데모' : '로그인 검증 데모'}</h1>
            <p>{creating ? '이메일과 10자 이상의 비밀번호를 입력해 가입 흐름을 확인하세요.' : '입력 오류와 다시 시도 흐름을 확인하는 로컬 데모입니다.'}</p>
          </div>

          {notice ? (
            <div className={`login-notice login-notice--${notice.tone}`}>
              <p ref={noticeRef} className="login-notice-message" role={notice.tone === 'error' ? 'alert' : 'status'} aria-live={notice.tone === 'error' ? 'assertive' : 'polite'} aria-atomic="true" tabIndex={-1}>{notice.message}</p>
              {notice.retryable ? <button className="login-retry-button" type="button" onClick={retryDemo} disabled={pending}>{pending ? '다시 확인 중...' : '다시 시도'}</button> : null}
            </div>
          ) : null}

          <form className="login-form" id="login-form" noValidate onSubmit={handleSubmit} aria-busy={pending}>
            <div className="login-field">
              <label htmlFor="login-email">이메일 주소</label>
              <input ref={emailRef} id="login-email" className="login-input" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} disabled={pending} required aria-required="true" aria-invalid={Boolean(errors.email)} aria-describedby={emailDescription} aria-errormessage={errors.email ? 'login-email-error' : undefined} />
              <p className="login-help" id="login-email-help">계정 정보는 이 데모에서 저장되지 않습니다.</p>
              {errors.email ? <p className="login-error" id="login-email-error" role="alert">{errors.email}</p> : null}
            </div>

            <div className="login-field">
              <label htmlFor="login-password">비밀번호</label>
              <div className="login-password-control">
                <input ref={passwordRef} id="login-password" className="login-input" type={passwordVisible ? 'text' : 'password'} autoComplete={creating ? 'new-password' : 'current-password'} value={password} onChange={(event) => setPassword(event.target.value)} disabled={pending} required aria-required="true" aria-invalid={Boolean(errors.password)} aria-describedby={passwordDescription} aria-errormessage={errors.password ? 'login-password-error' : undefined} minLength={10} maxLength={128} />
                <button className="login-visibility-button" type="button" aria-label={passwordVisible ? '비밀번호 숨기기' : '비밀번호 표시'} aria-pressed={passwordVisible} onClick={() => setPasswordVisible((visible) => !visible)} disabled={pending}>{passwordVisible ? '숨기기' : '표시'}</button>
              </div>
              <p className="login-help" id="login-password-help">10~128자로 입력하세요.</p>
              {errors.password ? <p className="login-error" id="login-password-error" role="alert">{errors.password}</p> : null}
            </div>

            {creating ? (
              <div className="login-field">
                <label htmlFor="login-confirmation">비밀번호 확인</label>
                <input ref={confirmationRef} id="login-confirmation" className="login-input" type={passwordVisible ? 'text' : 'password'} autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} disabled={pending} required aria-required="true" aria-invalid={Boolean(errors.confirmation)} aria-describedby={confirmationDescription} aria-errormessage={errors.confirmation ? 'login-confirmation-error' : undefined} minLength={10} maxLength={128} />
                {errors.confirmation ? <p className="login-error" id="login-confirmation-error" role="alert">{errors.confirmation}</p> : null}
              </div>
            ) : null}

            <button className="login-submit-button" type="submit" disabled={pending}>{pending ? '데모 확인 중...' : creating ? '가입 데모 확인' : '로그인 데모 확인'}</button>
          </form>
          <p className="login-footer-note">FE-015 로컬 검증 화면. 실제 계정이나 세션은 생성되지 않습니다.</p>
        </div>
      </section>
    </main>
  )
}
