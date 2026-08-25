import { useEffect, useRef, useState, type FormEvent } from 'react'
import { authClient, type AuthProfile } from '../domain/auth'
import { AppLink } from '../routes/AppLink'
import '../auth.css'

type AccountPageProps = {
  onNavigate: (path: string) => void
  onLoggedOut: () => void
}

function formatDate(value: string | null): string {
  if (!value) return '정보 없음'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '정보 없음' : new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

export function AccountPage({ onNavigate, onLoggedOut }: AccountPageProps) {
  const [profile, setProfile] = useState<AuthProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [newPassword, setNewPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [operation, setOperation] = useState<'idle' | 'password' | 'logout'>('idle')
  const [notice, setNotice] = useState<{ tone: 'error' | 'success'; text: string } | null>(null)
  const request = useRef<AbortController | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    request.current = controller
    let active = true
    void authClient.getSession(controller.signal)
      .then((nextProfile) => {
        if (!active) return
        if (!nextProfile) {
          onLoggedOut()
          return
        }
        setProfile(nextProfile)
      })
      .catch((error: unknown) => {
        if (active && (error as DOMException).name !== 'AbortError') setNotice({ tone: 'error', text: '계정 정보를 불러오지 못했습니다. 페이지를 새로고침해 보세요.' })
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
      controller.abort()
      request.current?.abort()
    }
  }, [onLoggedOut])

  async function updatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (operation !== 'idle') return
    if (newPassword !== confirmation) {
      setNotice({ tone: 'error', text: '비밀번호 확인이 일치하지 않습니다.' })
      return
    }
    const controller = new AbortController()
    request.current?.abort()
    request.current = controller
    setOperation('password')
    setNotice(null)
    try {
      await authClient.updatePassword(newPassword, controller.signal)
      setNewPassword('')
      setConfirmation('')
      setNotice({ tone: 'success', text: '비밀번호를 변경했습니다.' })
    } catch (error) {
      if ((error as DOMException).name !== 'AbortError') setNotice({ tone: 'error', text: error instanceof Error && error.name === 'AuthInputError' ? error.message : '비밀번호를 변경하지 못했습니다. 잠시 후 다시 시도하세요.' })
    } finally {
      if (request.current === controller) setOperation('idle')
    }
  }

  async function logout() {
    if (operation !== 'idle') return
    const controller = new AbortController()
    request.current?.abort()
    request.current = controller
    setOperation('logout')
    setNotice(null)
    try {
      await authClient.logout(controller.signal)
      onLoggedOut()
    } catch {
      setNotice({ tone: 'error', text: '로그아웃하지 못했습니다. 다시 시도하세요.' })
      setOperation('idle')
    }
  }

  return (
    <section className="page account-page" aria-labelledby="account-title">
      <header className="account-heading">
        <div>
          <p className="public-kicker">계정</p>
          <h1 id="account-title">계정 설정</h1>
          <p>PaperBridge 작업 공간에 사용하는 이메일 계정을 관리합니다.</p>
        </div>
      </header>

      {notice ? <p className={`auth-notice auth-notice--${notice.tone}`} aria-live="polite">{notice.text}</p> : null}
      {loading ? <p className="account-loading" role="status">계정 정보를 불러오는 중…</p> : null}

      {profile ? <div className="account-grid">
        <section className="account-panel" aria-labelledby="account-profile-title">
          <h2 id="account-profile-title">프로필</h2>
          <dl className="account-facts">
            <div><dt>이메일</dt><dd>{profile.email}</dd></div>
            <div><dt>생성일</dt><dd>{formatDate(profile.createdAt)}</dd></div>
            <div><dt>최근 로그인</dt><dd>{formatDate(profile.lastSignInAt)}</dd></div>
          </dl>
          <p className="account-note">모델 인증 정보는 분리해 보관합니다. 개인 제공자 인증 정보는 <AppLink href="/settings" onNavigate={onNavigate}>설정</AppLink>에서 관리하세요.</p>
        </section>

        <section className="account-panel" aria-labelledby="account-password-title">
          <h2 id="account-password-title">비밀번호</h2>
          <p>10~128자를 사용하세요. 새 비밀번호는 이 양식을 작성하는 동안에만 화면에 유지됩니다.</p>
          <form className="auth-form account-form" noValidate onSubmit={(event) => void updatePassword(event)}>
            <label htmlFor="account-password">새 비밀번호
              <input id="account-password" className="input" type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={10} maxLength={128} disabled={operation !== 'idle'} required />
            </label>
            <label htmlFor="account-confirmation">새 비밀번호 확인
              <input id="account-confirmation" className="input" type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} minLength={10} maxLength={128} disabled={operation !== 'idle'} required />
            </label>
            <button className="button" type="submit" disabled={operation !== 'idle'}>{operation === 'password' ? '변경 중…' : '비밀번호 변경'}</button>
          </form>
        </section>
      </div> : null}

      {profile ? <section className="account-panel account-signout" aria-labelledby="account-signout-title">
        <div><h2 id="account-signout-title">로그아웃</h2><p>이 브라우저에서 이 계정을 로그아웃합니다.</p></div>
        <button className="button button--secondary" type="button" onClick={() => void logout()} disabled={operation !== 'idle'}>{operation === 'logout' ? '로그아웃 중…' : '로그아웃'}</button>
      </section> : null}
    </section>
  )
}
