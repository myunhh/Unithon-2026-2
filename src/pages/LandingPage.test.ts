import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { LandingPage } from './LandingPage'
import { transitionSessionDemo } from './landing/sessionFixtures'

const navigate = (_path: string): void => undefined

describe('LandingPage session demo', () => {
  it('exposes the anonymous session state and a demo-only seam by default', () => {
    const markup = renderToStaticMarkup(createElement(LandingPage, { onNavigate: navigate }))

    expect(markup).toContain('data-session-demo="true"')
    expect(markup).toContain('data-session-state="anonymous"')
    expect(markup).toContain('data-demo-seam="fixture"')
    expect(markup).toContain('aria-pressed="true"')
    expect(markup).toContain('data-session-action="select-authenticated"')
  })

  it('renders the authenticated fixture with local password and logout controls', () => {
    const markup = renderToStaticMarkup(createElement(LandingPage, {
      onNavigate: navigate,
      initialSessionState: 'authenticated',
    }))

    expect(markup).toContain('data-session-state="authenticated"')
    expect(markup).toContain('data-session-profile="fixture"')
    expect(markup).toContain('data-password-demo="true"')
    expect(markup).toContain('data-session-action="logout"')
    expect(markup).toContain('autoComplete="new-password"')
  })

  it('renders loading as an announced, non-network demo state', () => {
    const markup = renderToStaticMarkup(createElement(LandingPage, {
      onNavigate: navigate,
      initialSessionState: 'loading',
    }))

    expect(markup).toContain('data-session-state="loading"')
    expect(markup).toContain('data-session-view="loading"')
    expect(markup).toContain('role="status"')
    expect(markup).toContain('aria-live="polite"')
  })

  it('keeps the error state actionable with an accessible retry control', () => {
    const markup = renderToStaticMarkup(createElement(LandingPage, {
      onNavigate: navigate,
      initialSessionState: 'error',
    }))

    expect(markup).toContain('data-session-state="error"')
    expect(markup).toContain('data-session-alert="error"')
    expect(markup).toContain('role="alert"')
    expect(markup).toContain('data-session-action="retry"')
  })
})

describe('transitionSessionDemo', () => {
  it('moves an error fixture to anonymous when retrying', () => {
    expect(transitionSessionDemo('error', { type: 'retry' })).toBe('anonymous')
  })

  it('moves an authenticated fixture to anonymous when logging out', () => {
    expect(transitionSessionDemo('authenticated', { type: 'logout' })).toBe('anonymous')
  })

  it('allows every supported fixture state to be selected', () => {
    expect(transitionSessionDemo('anonymous', { type: 'select', state: 'loading' })).toBe('loading')
    expect(transitionSessionDemo('loading', { type: 'select', state: 'authenticated' })).toBe('authenticated')
  })
})
