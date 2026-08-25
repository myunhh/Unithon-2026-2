import { useState, type FormEvent } from 'react'
import { AppLink } from '../routes/AppLink'
import {
  SESSION_DEMO_PROFILE,
  SESSION_DEMO_STATES,
  transitionSessionDemo,
  type SessionDemoState,
} from './landing/sessionFixtures'
import '../auth.css'
import './LandingPage.css'

type LandingPageProps = {
  readonly onNavigate: (path: string) => void
  readonly initialSessionState?: SessionDemoState
}

type PasswordNotice = 'too-short' | 'mismatch' | 'changed'

const SESSION_LABELS = {
  loading: '확인 중',
  anonymous: '로그아웃됨',
  authenticated: '로그인됨 (데모)',
  error: '오류',
} as const satisfies Record<SessionDemoState, string>

const PASSWORD_NOTICE_COPY = {
  'too-short': '비밀번호는 데모에서도 10자 이상이어야 합니다.',
  mismatch: '두 입력이 일치하지 않습니다. 데모에서만 확인합니다.',
  changed: '데모에서 비밀번호 변경을 완료했습니다. 실제 계정은 변경되지 않았습니다.',
} as const satisfies Record<PasswordNotice, string>

export function LandingPage({ onNavigate, initialSessionState = 'anonymous' }: LandingPageProps) {
  const [sessionState, setSessionState] = useState<SessionDemoState>(initialSessionState)
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [passwordNotice, setPasswordNotice] = useState<PasswordNotice | null>(null)

  function selectSessionState(nextState: SessionDemoState) {
    setSessionState((current) => transitionSessionDemo(current, { type: 'select', state: nextState }))
    setPasswordNotice(null)
    if (nextState !== 'authenticated') {
      setPassword('')
      setConfirmation('')
    }
  }

  function retrySession() {
    setSessionState((current) => transitionSessionDemo(current, { type: 'retry' }))
  }

  function logoutDemo() {
    setSessionState((current) => transitionSessionDemo(current, { type: 'logout' }))
    setPassword('')
    setConfirmation('')
    setPasswordNotice(null)
  }

  function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (Array.from(password).length < 10) {
      setPasswordNotice('too-short')
      return
    }
    if (password !== confirmation) {
      setPasswordNotice('mismatch')
      return
    }
    setPasswordNotice('changed')
    setPassword('')
    setConfirmation('')
  }

  const sessionContent = (() => {
    switch (sessionState) {
      case 'loading':
        return <div className="landing-session-view landing-session-view--loading" data-session-view="loading" role="status" aria-live="polite"><span className="landing-state-mark" aria-hidden="true" /><div><h3>세션 정보를 확인하는 중…</h3><p>이 화면은 요청을 보내지 않는 로컬 데모입니다.</p></div></div>
      case 'anonymous':
        return <div className="landing-session-view" data-session-view="anonymous"><h3>현재 세션이 없습니다.</h3><p>로그인 전 화면과 보관함 둘러보기를 확인할 수 있습니다.</p><div className="landing-session-actions"><AppLink className="button" href="/login" onNavigate={onNavigate}>로그인 화면 열기</AppLink><AppLink className="button button--secondary" href="/library" onNavigate={onNavigate}>문서 보관함 둘러보기</AppLink></div></div>
      case 'authenticated':
        return <div className="landing-session-view" data-session-view="authenticated"><div className="landing-profile" data-session-profile="fixture"><div><p className="landing-profile-label">데모 프로필</p><strong>{SESSION_DEMO_PROFILE.email}</strong></div><span className="landing-session-badge" data-session-badge="authenticated">로그인됨 (데모)</span></div><dl className="landing-profile-facts"><div><dt>생성일</dt><dd>{SESSION_DEMO_PROFILE.createdAt}</dd></div><div><dt>최근 로그인</dt><dd>{SESSION_DEMO_PROFILE.lastSignInAt}</dd></div></dl><section className="landing-password" aria-labelledby="landing-password-title"><div><h3 id="landing-password-title">비밀번호 변경 데모</h3><p>입력값은 이 화면에서만 확인하며 서버로 전송하지 않습니다.</p></div>{passwordNotice ? <p className={`landing-password-notice landing-password-notice--${passwordNotice}`} data-password-notice={passwordNotice} role={passwordNotice === 'changed' ? 'status' : 'alert'} aria-live="polite">{PASSWORD_NOTICE_COPY[passwordNotice]}</p> : null}<form className="landing-password-form" data-password-demo="true" noValidate onSubmit={submitPassword}><label htmlFor="landing-password">새 비밀번호<input id="landing-password" className="input" type="password" autoComplete="new-password" minLength={10} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} aria-describedby="landing-password-help" required /></label><label htmlFor="landing-password-confirmation">새 비밀번호 확인<input id="landing-password-confirmation" className="input" type="password" autoComplete="new-password" minLength={10} maxLength={128} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required /></label><p id="landing-password-help" className="landing-field-help">10~128자 · 실제 계정은 변경되지 않습니다.</p><button className="button" type="submit">데모에서 비밀번호 확인</button></form></section><button className="button button--secondary landing-logout" type="button" data-session-action="logout" onClick={logoutDemo}>데모에서 로그아웃</button></div>
      case 'error':
        return <div className="landing-session-view landing-session-view--error" data-session-view="error" data-session-alert="error" role="alert" aria-live="assertive"><h3>세션 확인 오류 (데모)</h3><p>실제 서버 오류가 아닙니다. 다시 시도하면 로그아웃 상태로 돌아갑니다.</p><button className="button" type="button" data-session-action="retry" onClick={retrySession}>데모 다시 시도</button></div>
      default:
        return assertNever(sessionState)
    }
  })()

  return <main className="public-page landing-page" data-session-demo="true" data-demo-seam="fixture"><header className="public-header"><AppLink className="public-brand" href="/" onNavigate={onNavigate}>PaperBridge</AppLink><nav aria-label="랜딩 메뉴"><AppLink className="public-text-link" href="/login" onNavigate={onNavigate}>로그인</AppLink></nav></header><section className="landing-hero" aria-labelledby="landing-title"><div className="landing-intro"><p className="public-kicker">논문 읽기 작업 공간</p><h1 id="landing-title"><span className="landing-heading-line">읽기 흐름과 세션 상태를</span><span className="landing-heading-line">한 화면에서 확인합니다.</span></h1><p className="landing-lede">PDF의 근거를 보며 설명과 번역을 준비하는 PaperBridge입니다. 아래 세션 영역은 BE-020 연결 전 UI만 검증하는 데모이며, 실제 인증 요청을 보내지 않습니다.</p><div className="public-actions"><AppLink className="button" href="/login" onNavigate={onNavigate}>로그인 화면 열기</AppLink><AppLink className="button button--secondary" href="/library" onNavigate={onNavigate}>계정 없이 둘러보기</AppLink></div></div><section className="landing-session-card" aria-labelledby="landing-session-title"><div className="landing-session-heading"><div><p className="public-kicker">Session demo</p><h2 id="landing-session-title">세션 상태</h2></div><span className="landing-demo-badge">데모 · 실제 인증 없음</span></div><p className="landing-demo-note">상태 버튼으로 로딩·로그아웃·로그인·오류 화면을 직접 확인하세요. 데이터와 입력값은 저장되지 않습니다.</p><fieldset className="landing-state-switcher"><legend>데모 세션 상태</legend><div className="landing-state-options">{SESSION_DEMO_STATES.map((state) => <button key={state} className="landing-state-option" type="button" data-session-action={`select-${state}`} aria-pressed={sessionState === state} data-active={sessionState === state} onClick={() => selectSessionState(state)}>{SESSION_LABELS[state]}</button>)}</div></fieldset><div className="landing-session-status" data-session-state={sessionState} role="status" aria-live="polite"><span className="landing-session-status-label">현재 데모 상태</span><strong>{SESSION_LABELS[sessionState]}</strong></div>{sessionContent}</section></section><section className="landing-evidence" aria-label="PaperBridge 기능"><article className="landing-panel"><p className="public-kicker">읽기 흐름</p><h2>근거를 계속 눈앞에 둡니다.</h2><ul className="landing-list"><li>문서를 올리고 읽는 일을 하나의 보관함에서 처리합니다.</li><li>수동 하이라이트를 문서와 선택한 텍스트에 연결해 둡니다.</li><li>리더에서 설명, 번역, 맥락 질문을 바로 준비합니다.</li></ul></article><article className="landing-panel"><p className="public-kicker">AI 제공자 상태</p><h2>웹과 데스크톱의 선택지가 다릅니다.</h2><dl className="availability-list"><div><dt>웹</dt><dd>설정에서 개인 제공자 인증 정보를 연결해 사용합니다.</dd></div><div><dt>데스크톱 앱</dt><dd>설치·인증된 로컬 구독 CLI도 확인할 수 있습니다.</dd></div><div><dt>계정</dt><dd>읽기 작업 공간과 모델 인증 정보를 분리해 보관합니다.</dd></div></dl></article></section><footer className="public-footer"><span>PaperBridge는 읽기에 집중한 작업 공간입니다.</span><AppLink href="/library" onNavigate={onNavigate}>문서 보관함 열기</AppLink></footer></main>
}

function assertNever(value: never): never {
  throw new Error(`Unexpected session demo state: ${String(value)}`)
}
