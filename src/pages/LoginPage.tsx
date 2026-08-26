import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { AppLink } from '../routes/AppLink'
import { authClient } from '../domain/auth'
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

export function LoginPage({ onNavigate, onAuthenticated }: LoginPageProps) {
  const [mode, setMode] = useState<LoginMode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [errors, setErrors] = useState<LoginErrors>({})
  const [notice, setNotice] = useState<Notice | null>(null)
  const [pending, setPending] = useState(false)
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

  async function completeAuthentication(nextMode: LoginMode, draft: LoginDraft): Promise<void> {
    const currentRun = runId.current + 1
    runId.current = currentRun
    setPending(true)
    setNotice(null)
    try {
      if (nextMode === 'login') {
        await authClient.login({ email: draft.email, password: draft.password })
        if (runId.current === currentRun) onAuthenticated()
        return
      }

      const result = await authClient.signup({ email: draft.email, password: draft.password })
      if (runId.current !== currentRun) return
      if (result.emailConfirmationRequired) {
        setNotice({ tone: 'success', message: '가입되었습니다. 이메일 확인을 마친 뒤 로그인하세요.', retryable: false })
      } else {
        onAuthenticated()
      }
    } catch {
      if (runId.current === currentRun) {
        setNotice({
          tone: 'error',
          message: nextMode === 'login'
            ? '로그인하지 못했습니다. 계정 정보와 서버 연결을 확인하세요.'
            : '가입하지 못했습니다. 입력값과 서버 설정을 확인하세요.',
          retryable: true,
        })
      }
    } finally {
      if (runId.current === currentRun) setPending(false)
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

    setLastValidDraft(draft)
    void completeAuthentication(mode, draft)
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    if (pending) return
    submitDraft({ email, password, confirmation })
  }

  function retryAuthentication(): void {
    if (!lastValidDraft || pending) return
    void completeAuthentication(mode, lastValidDraft)
  }

  const emailDescription = errors.email ? 'login-email-help login-email-error' : 'login-email-help'
  const passwordDescription = errors.password
    ? 'login-password-help login-password-error'
    : 'login-password-help'
  const confirmationDescription = errors.confirmation ? 'login-confirmation-error' : undefined

  return (
    <main className="login-page">
      <header className="login-header">
        <AppLink className="login-brand" href="/" onNavigate={onNavigate}>PaperBridge</AppLink>
        <AppLink className="login-secondary-link" href="/library" onNavigate={onNavigate}>계정 없이 계속하기</AppLink>
      </header>

      <section className="login-card" aria-labelledby="login-title">
        <div className="login-demo-banner" role="note" aria-label="로그인 및 가입">
          <div className="login-demo-banner-heading"><span>안전한 계정 연결</span></div>
          <p>인증 정보는 PaperBridge 서버로만 전송되며 화면이나 로그에 남기지 않습니다.</p>
        </div>

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
            <p className="login-kicker">PaperBridge 계정</p>
            <h1 id="login-title">{creating ? '계정 만들기' : '로그인'}</h1>
            <p>{creating ? '이메일과 10자 이상의 비밀번호로 계정을 만드세요.' : '계정에 연결해 문서와 설정을 이어서 사용하세요.'}</p>
          </div>

          {notice ? (
            <div className={`login-notice login-notice--${notice.tone}`}>
              <p ref={noticeRef} className="login-notice-message" role={notice.tone === 'error' ? 'alert' : 'status'} aria-live={notice.tone === 'error' ? 'assertive' : 'polite'} aria-atomic="true" tabIndex={-1}>{notice.message}</p>
              {notice.retryable ? <button className="login-retry-button" type="button" onClick={retryAuthentication} disabled={pending}>{pending ? '다시 요청 중...' : '다시 시도'}</button> : null}
            </div>
          ) : null}

          <form className="login-form" id="login-form" noValidate onSubmit={handleSubmit} aria-busy={pending}>
            <div className="login-field">
              <label htmlFor="login-email">이메일 주소</label>
              <input ref={emailRef} id="login-email" className="login-input" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} disabled={pending} required aria-required="true" aria-invalid={Boolean(errors.email)} aria-describedby={emailDescription} aria-errormessage={errors.email ? 'login-email-error' : undefined} />
              <p className="login-help" id="login-email-help">로그인과 계정 확인에 사용할 이메일입니다.</p>
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

            <button className="login-submit-button" type="submit" disabled={pending}>{pending ? '요청 중...' : creating ? '가입' : '로그인'}</button>
          </form>
          <p className="login-footer-note">세션은 안전한 HTTP 전용 쿠키로 유지됩니다.</p>
        </div>
      </section>
    </main>
  )
}
