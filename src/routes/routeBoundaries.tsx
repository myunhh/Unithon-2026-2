import { Suspense, type ReactNode } from 'react'
import type { AppRouteName } from './useAppRoute'

const routeLabels = {
  landing: 'PaperBridge',
  login: '계정',
  library: '문서 보관함',
  reader: '문서 리더',
  settings: '설정',
  account: '계정 설정',
} as const satisfies Record<AppRouteName, string>

type RouteLoadingProps = {
  routeName: AppRouteName
}

export function RouteLoading({ routeName }: RouteLoadingProps) {
  return (
    <section className="page" role="status" aria-live="polite">
      <p className="section-label">{routeLabels[routeName]}</p>
      <h1 className="page-title">화면을 불러오는 중…</h1>
      <p className="page-description">잠시만 기다려 주세요.</p>
    </section>
  )
}

type RouteBoundaryProps = {
  routeName: AppRouteName
  children: ReactNode
}

export function RouteBoundary({ routeName, children }: RouteBoundaryProps) {
  return (
    <Suspense fallback={<RouteLoading routeName={routeName} />}>
      {children}
    </Suspense>
  )
}
