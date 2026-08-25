import { useEffect, useState } from 'react'
import { AppShell } from './components/AppShell'
import { authClient } from './domain/auth'
import { AccountPage } from './pages/AccountPage'
import { LandingPage } from './pages/LandingPage'
import { LibraryPage } from './pages/LibraryPage'
import { LoginPage } from './pages/LoginPage'
import { ReaderPage } from './pages/ReaderPage'
import { SettingsPage } from './pages/SettingsPage'
import { useAppRoute } from './routes/useAppRoute'
import './App.css'

type AccountGateProps = {
  onNavigate: (path: string) => void
}

function AccountGate({ onNavigate }: AccountGateProps) {
  const [state, setState] = useState<'checking' | 'allowed' | 'error'>('checking')

  useEffect(() => {
    const controller = new AbortController()
    void authClient.getSession(controller.signal)
      .then((profile) => {
        if (controller.signal.aborted) return
        if (!profile) {
          onNavigate('/login')
          return
        }
        setState('allowed')
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted && (error as DOMException).name !== 'AbortError') setState('error')
      })
    return () => controller.abort()
  }, [onNavigate])

  if (state === 'checking') return <section className="page" role="status">계정 접근 권한을 확인하는 중…</section>
  if (state === 'error') return <section className="page"><h1 className="card-title">계정 확인 오류</h1><p className="page-description">계정 접근 권한을 확인하지 못했습니다. 페이지를 새로고침한 뒤 다시 시도하세요.</p></section>
  return <AccountPage onNavigate={onNavigate} onLoggedOut={() => onNavigate('/login')} />
}

function App() {
  const { route, navigate } = useAppRoute()

  if (route.name === 'landing') return <LandingPage onNavigate={navigate} />
  if (route.name === 'login') return <LoginPage onNavigate={navigate} onAuthenticated={() => navigate('/account')} />

  const content = (() => {
    switch (route.name) {
      case 'reader':
        return (
          <ReaderPage
            key={route.documentId}
            documentId={route.documentId}
            onBackToLibrary={() => navigate('/library')}
            onOpenSettings={() => navigate('/settings')}
          />
        )
      case 'settings':
        return <SettingsPage />
      case 'account':
        return <AccountGate onNavigate={navigate} />
      case 'library':
        return <LibraryPage onNavigate={navigate} />
    }
  })()

  return (
    <AppShell currentRoute={route.name} onNavigate={navigate}>
      {content}
    </AppShell>
  )
}

export default App
