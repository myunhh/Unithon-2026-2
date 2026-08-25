import { useCallback, useEffect, useState } from 'react'

export type AppRoute =
  | { name: 'landing' }
  | { name: 'library' }
  | { name: 'reader'; documentId: string }
  | { name: 'settings' }
  | { name: 'login' }
  | { name: 'account' }

export type AppRouteName = AppRoute['name']

export function routeFromPath(pathname: string): AppRoute {
  const segments = pathname.split('/').filter(Boolean)

  if (segments.length === 0) return { name: 'landing' }

  if (segments[0] === 'reader' && segments[1]) {
    return { name: 'reader', documentId: decodeURIComponent(segments[1]) }
  }

  if (segments[0] === 'settings') {
    return { name: 'settings' }
  }

  if (segments[0] === 'login') return { name: 'login' }

  if (segments[0] === 'account') return { name: 'account' }

  return { name: 'library' }
}

function readCurrentRoute(): AppRoute {
  if (typeof window === 'undefined') {
    return { name: 'library' }
  }

  return routeFromPath(window.location.pathname)
}

export function useAppRoute() {
  const [route, setRoute] = useState<AppRoute>(readCurrentRoute)

  useEffect(() => {
    const updateRoute = () => setRoute(readCurrentRoute())
    window.addEventListener('popstate', updateRoute)
    return () => window.removeEventListener('popstate', updateRoute)
  }, [])

  const navigate = useCallback((path: string) => {
    if (window.location.pathname !== path) {
      window.history.pushState({}, '', path)
      setRoute(routeFromPath(path))
    }
  }, [])

  return { route, navigate }
}
