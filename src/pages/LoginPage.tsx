import { useEffect, useRef, useState, type FormEvent } from 'react'
import { authClient } from '../domain/auth'
import { AppLink } from '../routes/AppLink'
import '../auth.css'

type LoginPageProps = {
  onNavigate: (path: string) => void
  onAuthenticated: () => void
}

type Mode = 'login' | 'signup'

export function LoginPage({ onNavigate, onAuthenticated }: LoginPageProps) {
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [pending, setPending] = useState(false)
  const [notice, setNotice] = useState<{ tone: 'error' | 'success'; text: string } | null>(null)
  const controller = useRef<AbortController | null>(null)

  useEffect(() => () => controller.current?.abort(), [])

  function switchMode(nextMode: Mode) {
    controller.current?.abort()
    setMode(nextMode)
    setPassword('')
    setConfirmation('')
    setNotice(null)
    setPending(false)
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    if (mode === 'signup' && password !== confirmation) {
      setNotice({ tone: 'error', text: '비밀번호 확인이 일치하지 않습니다.' })
      return
    }

    const nextController = new AbortController()
    controller.current?.abort()
    controller.current = nextController
    setPending(true)
    setNotice(null)
    try {
      if (mode === 'login') {
        await authClient.login({ email, password }, nextController.signal)
        setPassword('')
        onAuthenticated()
        return
      }
      const result = await authClient.signup({ email, password }, nextController.signal)
      setPassword('')
      setConfirmation('')
      if (result.emailConfirmationRequired) {
        setNotice({ tone: 'success', text: '이메일을 확인해 계정을 인증한 뒤 이 화면에서 로그인하세요.' })
      } else {
        onAuthenticated()
      }
    } catch (error) {
      if ((error as DOMException).name !== 'AbortError') {
        setNotice({ tone: 'error', text: error instanceof Error && error.name === 'AuthInputError'
          ? error.message
          : '계정 요청을 완료하지 못했습니다. 입력 내용을 확인한 뒤 다시 시도하세요.' })
      }
    } finally {
      if (controller.current === nextController) setPending(false)
    }
  }

  const creating = mode === 'signup'
  return (
    <main className="public-page auth-page">
      <header className="public-header">
        <AppLink className="public-brand" href="/" onNavigate={onNavigate}>PaperBridge</AppLink>
        <AppLink className="public-text-link" href="/library" onNavigate={onNavigate}>계정 없이 계속하기</AppLink>
      </header>

      <section className="auth-card" aria-labelledby="auth-title">
        <div className="auth-tabs" role="group" aria-label="계정 작업">
          <button type="button" aria-pressed={!creating} className="auth-tab" data-active={!creating} onClick={() => switchMode('login')}>로그인</button>
          <button type="button" aria-pressed={creating} className="auth-tab" data-active={creating} onClick={() => switchMode('signup')}>계정 만들기</button>
        </div>
        <div className="auth-card-heading">
          <p className="public-kicker">계정</p>
          <h1 id="auth-title">{creating ? 'PaperBridge 계정 만들기' : 'PaperBridge에 로그인'}</h1>
          <p>{creating ? '이메일 주소와 10자 이상의 비밀번호를 사용하세요.' : '계정으로 여러 기기에서 읽기 작업 공간을 이어갈 수 있습니다.'}</p>
        </div>

        {notice ? <p className={`auth-notice auth-notice--${notice.tone}`} aria-live="polite">{notice.text}</p> : null}

        <form className="auth-form" noValidate onSubmit={(event) => void submit(event)}>
          <label htmlFor="auth-email">이메일 주소
            <input id="auth-email" className="input" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} disabled={pending} required />
          </label>
          <label htmlFor="auth-password">비밀번호
            <input id="auth-password" className="input" type="password" autoComplete={creating ? 'new-password' : 'current-password'} value={password} onChange={(event) => setPassword(event.target.value)} disabled={pending} minLength={10} maxLength={128} required />
          </label>
          {creating ? <label htmlFor="auth-confirmation">비밀번호 확인
            <input id="auth-confirmation" className="input" type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} disabled={pending} minLength={10} maxLength={128} required />
          </label> : null}
          <button className="button" type="submit" disabled={pending}>{pending ? '처리 중…' : creating ? '계정 만들기' : '로그인'}</button>
        </form>
      </section>
    </main>
  )
}
