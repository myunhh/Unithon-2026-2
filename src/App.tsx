import { useEffect, useState } from 'react'
import { AppShell } from './components/AppShell'
import { authClient } from './domain/auth'
import { lazyRoutePages } from './routes/lazyRoutePages'
import { RouteBoundary } from './routes/routeBoundaries'
import { useAppRoute } from './routes/useAppRoute'
import './App.css'
import './auth.css'

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
  return <lazyRoutePages.account onNavigate={onNavigate} onLoggedOut={() => onNavigate('/login')} />
}

function App() {
  const { route, navigate } = useAppRoute()

  if (route.name === 'landing') {
    return (
      <RouteBoundary routeName={route.name}>
        <lazyRoutePages.landing onNavigate={navigate} />
      </RouteBoundary>
    )
  }
  if (route.name === 'login') {
    return (
      <RouteBoundary routeName={route.name}>
        <lazyRoutePages.login onNavigate={navigate} onAuthenticated={() => navigate('/account')} />
      </RouteBoundary>
    )
  }

  const content = (() => {
    switch (route.name) {
      case 'reader':
        return (
          <lazyRoutePages.reader
            key={route.documentId}
            documentId={route.documentId}
            onBackToLibrary={() => navigate('/library')}
            onOpenSettings={() => navigate('/settings')}
          />
        )
      case 'settings':
        return <lazyRoutePages.settings />
      case 'account':
        return <AccountGate onNavigate={navigate} />
      case 'library':
        return <lazyRoutePages.library onNavigate={navigate} />
    }
  })()

  return (
    <AppShell currentRoute={route.name} onNavigate={navigate}>
      <RouteBoundary routeName={route.name}>{content}</RouteBoundary>
    </AppShell>
  )
}

export default App
