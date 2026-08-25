import { createElement, lazy, Suspense, type ReactElement } from 'react'
import { jsx } from 'react/jsx-runtime'
import { renderToStaticMarkup, renderToString } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { AppRouteName } from './useAppRoute'

const loadedRoutes = vi.hoisted(() => new Set<AppRouteName>())

vi.mock('../pages/LandingPage', () => {
  loadedRoutes.add('landing')
  return { LandingPage: () => createElement('p', { 'data-route': 'landing' }, 'landing route') }
})

vi.mock('../pages/LoginPage', () => {
  loadedRoutes.add('login')
  return { LoginPage: () => createElement('p', { 'data-route': 'login' }, 'login route') }
})

vi.mock('../pages/LibraryPage', () => {
  loadedRoutes.add('library')
  return { LibraryPage: () => createElement('p', { 'data-route': 'library' }, 'library route') }
})

vi.mock('../pages/ReaderPage', () => {
  loadedRoutes.add('reader')
  return { ReaderPage: () => createElement('p', { 'data-route': 'reader' }, 'reader route') }
})

vi.mock('../pages/SettingsPage', () => {
  loadedRoutes.add('settings')
  return { SettingsPage: () => createElement('p', { 'data-route': 'settings' }, 'settings route') }
})

vi.mock('../pages/AccountPage', () => {
  loadedRoutes.add('account')
  return { AccountPage: () => createElement('p', { 'data-route': 'account' }, 'account route') }
})

import { lazyRoutePages } from './lazyRoutePages'
import { RouteBoundary, RouteLoading } from './routeBoundaries'

const routeNames = ['landing', 'login', 'library', 'reader', 'settings', 'account'] as const satisfies readonly AppRouteName[]

const navigate = (_path: string): void => undefined

function routeElement(routeName: AppRouteName): ReactElement {
  switch (routeName) {
    case 'landing':
      return createElement(lazyRoutePages.landing, { onNavigate: navigate })
    case 'login':
      return createElement(lazyRoutePages.login, { onNavigate: navigate, onAuthenticated: () => undefined })
    case 'library':
      return createElement(lazyRoutePages.library, { onNavigate: navigate })
    case 'reader':
      return createElement(lazyRoutePages.reader, {
        documentId: 'paper-1',
        onBackToLibrary: () => undefined,
        onOpenSettings: () => undefined,
      })
    case 'settings':
      return createElement(lazyRoutePages.settings)
    case 'account':
      return createElement(lazyRoutePages.account, { onNavigate: navigate, onLoggedOut: () => undefined })
    default:
      return assertNever(routeName)
  }
}

function assertNever(value: never): never {
  throw new Error(`Unexpected route ${String(value)}`)
}

describe('route lazy boundaries', () => {
  it.each(routeNames)('loads the %s page only after its boundary renders', async (routeName) => {
    loadedRoutes.delete(routeName)
    const markupBeforeLoad = renderToString(createElement(Suspense, {
      fallback: createElement('p', { 'data-loading': routeName }, 'loading'),
    }, routeElement(routeName)))

    expect(loadedRoutes.has(routeName)).toBe(false)
    expect(markupBeforeLoad).toContain(`data-loading="${routeName}"`)

    await vi.dynamicImportSettled()

    expect(loadedRoutes.has(routeName)).toBe(true)
    expect(renderToString(routeElement(routeName))).toContain(`data-route="${routeName}"`)
  })

  it('renders an explicit loading state while a route chunk is pending', () => {
    const loadingMarkup = renderToStaticMarkup(createElement(RouteLoading, { routeName: 'reader' }))
    expect(loadingMarkup).toContain('role="status"')
    expect(loadingMarkup).toContain('문서 리더')
    expect(loadingMarkup).toContain('화면을 불러오는 중')

    const pendingPage = lazy(() => new Promise<{ default: () => ReactElement }>(() => undefined))
    const boundaryMarkup = renderToString(jsx(RouteBoundary, {
      routeName: 'reader',
      children: jsx(pendingPage, {}),
    }))
    expect(boundaryMarkup).toContain('role="status"')
    expect(boundaryMarkup).toContain('화면을 불러오는 중')
  })
})
