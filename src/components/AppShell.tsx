import type { PropsWithChildren } from 'react'
import { AppLink } from '../routes/AppLink'
import type { AppRouteName } from '../routes/useAppRoute'

type AppShellProps = PropsWithChildren<{
  currentRoute: AppRouteName
  onNavigate: (path: string) => void
}>

const navigation = [
  { route: 'library', label: '문서 보관함', href: '/library' },
  { route: 'settings', label: '설정', href: '/settings' },
  { route: 'account', label: '계정', href: '/account' },
] as const

function Navigation({ currentRoute, onNavigate }: Omit<AppShellProps, 'children'>) {
  return (
    <>
      {navigation.map((item) => {
        const active = currentRoute === item.route || (currentRoute === 'reader' && item.route === 'library')
        return (
        <AppLink
          key={item.route}
          className="nav-link"
          data-active={active}
          aria-current={active ? 'page' : undefined}
          href={item.href}
          onNavigate={onNavigate}
        >
          <span>{item.label}</span>
        </AppLink>
        )
      })}
    </>
  )
}

export function AppShell({ children, currentRoute, onNavigate }: AppShellProps) {
  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="주요 메뉴">
        <AppLink className="brand" href="/library" onNavigate={onNavigate}>
          PaperBridge
        </AppLink>
        <nav className="sidebar-nav">
          <Navigation currentRoute={currentRoute} onNavigate={onNavigate} />
        </nav>
        <footer className="sidebar-footer">
          <span className="shell-state">현재 작업 공간 · 로컬 세션</span>
        </footer>
      </aside>

      <header className="mobile-header">
        <AppLink className="brand" href="/library" onNavigate={onNavigate}>
          PaperBridge
        </AppLink>
        <nav className="mobile-nav" aria-label="주요 메뉴">
          <Navigation currentRoute={currentRoute} onNavigate={onNavigate} />
        </nav>
      </header>

      <main className="app-main">{children}</main>
    </div>
  )
}
