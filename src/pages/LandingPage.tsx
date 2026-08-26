import { useEffect, useState, type FormEvent } from 'react'
import { AppLink } from '../routes/AppLink'
import { authClient, type AuthProfile } from '../domain/auth'
import '../auth.css'
import './LandingPage.css'

type LandingPageProps = {
  readonly onNavigate: (path: string) => void
}

type SessionState = 'loading' | 'anonymous' | 'authenticated' | 'error'
type PasswordNotice = Readonly<{ tone: 'error' | 'success'; text: string }>

const SESSION_LABELS: Readonly<Record<SessionState, string>> = {
  loading: '확인 중',
  anonymous: '로그아웃됨',
  authenticated: '로그인됨',
  error: '오류',
}

export function LandingPage({ onNavigate }: LandingPageProps) {
  const [sessionState, setSessionState] = useState<SessionState>('loading')
  const [profile, setProfile] = useState<AuthProfile | null>(null)
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [passwordNotice, setPasswordNotice] = useState<PasswordNotice | null>(null)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    void loadSession(controller.signal)
    return () => controller.abort()
  }, [])

  async function loadSession(signal?: AbortSignal): Promise<void> {
    setSessionState('loading')
    try {
      const nextProfile = await authClient.getSession(signal)
      setProfile(nextProfile)
      setSessionState(nextProfile ? 'authenticated' : 'anonymous')
    } catch (error) {
      if ((error as DOMException).name !== 'AbortError') setSessionState('error')
    }
  }

  async function logout(): Promise<void> {
    setPending(true)
    setPasswordNotice(null)
    try {
      await authClient.logout()
      setProfile(null)
      setSessionState('anonymous')
      setPassword('')
      setConfirmation('')
    } catch {
      setPasswordNotice({ tone: 'error', text: '로그아웃하지 못했습니다. 서버 연결을 확인한 뒤 다시 시도하세요.' })
    } finally {
      setPending(false)
    }
  }

  async function submitPassword(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (Array.from(password).length < 10) {
      setPasswordNotice({ tone: 'error', text: '비밀번호는 10자 이상이어야 합니다.' })
      return
    }
    if (password !== confirmation) {
      setPasswordNotice({ tone: 'error', text: '두 비밀번호 입력이 일치하지 않습니다.' })
      return
    }
    setPending(true)
    setPasswordNotice(null)
    try {
      await authClient.updatePassword(password)
      setPasswordNotice({ tone: 'success', text: '비밀번호를 변경했습니다.' })
      setPassword('')
      setConfirmation('')
    } catch {
      setPasswordNotice({ tone: 'error', text: '비밀번호를 변경하지 못했습니다. 다시 로그인한 뒤 시도하세요.' })
    } finally {
      setPending(false)
    }
  }

  const sessionContent = (() => {
    switch (sessionState) {
      case 'loading':
        return <div className="landing-session-view landing-session-view--loading" data-session-view="loading" role="status" aria-live="polite"><span className="landing-state-mark" aria-hidden="true" /><div><h3>세션 정보를 확인하는 중…</h3><p>PaperBridge 서버에서 로그인 상태를 확인하고 있습니다.</p></div></div>
      case 'anonymous':
        return <div className="landing-session-view" data-session-view="anonymous"><h3>현재 세션이 없습니다.</h3><p>로그인 전 화면과 보관함 둘러보기를 확인할 수 있습니다.</p><div className="landing-session-actions"><AppLink className="button" href="/login" onNavigate={onNavigate}>로그인 화면 열기</AppLink><AppLink className="button button--secondary" href="/library" onNavigate={onNavigate}>문서 보관함 둘러보기</AppLink></div></div>
      case 'authenticated':
        return <div className="landing-session-view" data-session-view="authenticated"><div className="landing-profile"><div><p className="landing-profile-label">현재 계정</p><strong>{profile?.email}</strong></div><span className="landing-session-badge" data-session-badge="authenticated">로그인됨</span></div><dl className="landing-profile-facts"><div><dt>생성일</dt><dd>{formatDate(profile?.createdAt)}</dd></div><div><dt>최근 로그인</dt><dd>{formatDate(profile?.lastSignInAt)}</dd></div></dl><section className="landing-password" aria-labelledby="landing-password-title"><div><h3 id="landing-password-title">비밀번호 변경</h3><p>새 비밀번호는 PaperBridge 인증 서버로 안전하게 전송됩니다.</p></div>{passwordNotice ? <p className={`landing-password-notice landing-password-notice--${passwordNotice.tone}`} role={passwordNotice.tone === 'success' ? 'status' : 'alert'} aria-live="polite">{passwordNotice.text}</p> : null}<form className="landing-password-form" noValidate onSubmit={(event) => void submitPassword(event)}><label htmlFor="landing-password">새 비밀번호<input id="landing-password" className="input" type="password" autoComplete="new-password" minLength={10} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} aria-describedby="landing-password-help" disabled={pending} required /></label><label htmlFor="landing-password-confirmation">새 비밀번호 확인<input id="landing-password-confirmation" className="input" type="password" autoComplete="new-password" minLength={10} maxLength={128} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} disabled={pending} required /></label><p id="landing-password-help" className="landing-field-help">10~128자로 입력하세요.</p><button className="button" type="submit" disabled={pending}>{pending ? '변경 중…' : '비밀번호 변경'}</button></form></section><button className="button button--secondary landing-logout" type="button" data-session-action="logout" onClick={() => void logout()} disabled={pending}>로그아웃</button></div>
      case 'error':
        return <div className="landing-session-view landing-session-view--error" data-session-view="error" data-session-alert="error" role="alert" aria-live="assertive"><h3>세션 확인 오류</h3><p>인증 서버에 연결하지 못했습니다. 서버 설정을 확인한 뒤 다시 시도하세요.</p><button className="button" type="button" data-session-action="retry" onClick={() => void loadSession()}>다시 시도</button></div>
      default:
        return unreachable(sessionState)
    }
  })()

  return <main className="public-page landing-page"><header className="public-header"><AppLink className="public-brand" href="/" onNavigate={onNavigate}>PaperBridge</AppLink><nav aria-label="랜딩 메뉴"><AppLink className="public-text-link" href="/login" onNavigate={onNavigate}>로그인</AppLink></nav></header><section className="landing-hero" aria-labelledby="landing-title"><div className="landing-intro"><p className="public-kicker">논문 읽기 작업 공간</p><h1 id="landing-title"><span className="landing-heading-line">읽기 흐름과 세션 상태를</span><span className="landing-heading-line">한 화면에서 확인합니다.</span></h1><p className="landing-lede">PDF의 근거를 보며 설명과 번역을 이어가는 PaperBridge입니다. 문서, 계정, 제공자 설정은 PaperBridge API와 연결됩니다.</p><div className="public-actions"><AppLink className="button" href="/login" onNavigate={onNavigate}>로그인</AppLink><AppLink className="button button--secondary" href="/library" onNavigate={onNavigate}>문서 보관함 열기</AppLink></div></div><section className="landing-session-card" aria-labelledby="landing-session-title"><div className="landing-session-heading"><div><p className="public-kicker">Session</p><h2 id="landing-session-title">세션 상태</h2></div><span className="landing-demo-badge">API 연결</span></div><div className="landing-session-status" data-session-state={sessionState} role="status" aria-live="polite" aria-atomic="true" aria-labelledby="landing-session-status-label"><span id="landing-session-status-label" className="landing-session-status-label">현재 상태</span><strong>{SESSION_LABELS[sessionState]}</strong></div>{sessionContent}</section></section><section className="landing-evidence" aria-label="PaperBridge 기능"><article className="landing-panel"><p className="public-kicker">읽기 흐름</p><h2>근거를 계속 눈앞에 둡니다.</h2><ul className="landing-list"><li>문서 업로드와 읽기를 한곳에서 처리합니다.</li><li>텍스트를 하이라이트로 저장합니다.</li><li>리더에서 설명, 번역, 맥락 질문을 바로 준비합니다.</li></ul></article><article className="landing-panel"><p className="public-kicker">AI 제공자 상태</p><h2>웹과 데스크톱의 선택지가 다릅니다.</h2><dl className="availability-list"><div><dt>웹</dt><dd>설정에서 개인 제공자 인증 정보를 연결해 사용합니다.</dd></div><div><dt>데스크톱 앱</dt><dd>설치·인증된 로컬 구독 CLI도 확인할 수 있습니다.</dd></div><div><dt>계정</dt><dd>읽기 작업 공간과 모델 인증 정보를 분리해 보관합니다.</dd></div></dl></article></section><footer className="public-footer"><span>PaperBridge는 읽기에 집중한 작업 공간입니다.</span><AppLink href="/library" onNavigate={onNavigate}>문서 보관함 열기</AppLink></footer></main>
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '기록 없음'
  return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function unreachable(value: never): never {
  throw new Error(`Unexpected session state: ${String(value)}`)
}
