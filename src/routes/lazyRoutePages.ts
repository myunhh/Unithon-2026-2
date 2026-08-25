import { lazy } from 'react'

export const lazyRoutePages = {
  landing: lazy(() => import('../pages/LandingPage').then(({ LandingPage }) => ({ default: LandingPage }))),
  login: lazy(() => import('../pages/LoginPage').then(({ LoginPage }) => ({ default: LoginPage }))),
  library: lazy(() => import('../pages/LibraryPage').then(({ LibraryPage }) => ({ default: LibraryPage }))),
  reader: lazy(() => import('../pages/ReaderPage').then(({ ReaderPage }) => ({ default: ReaderPage }))),
  settings: lazy(() => import('../pages/SettingsPage').then(({ SettingsPage }) => ({ default: SettingsPage }))),
  account: lazy(() => import('../pages/AccountPage').then(({ AccountPage }) => ({ default: AccountPage }))),
} as const
