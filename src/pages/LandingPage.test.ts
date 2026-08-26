import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { LandingPage } from './LandingPage'

const navigate = (_path: string): void => undefined

describe('LandingPage session bootstrap', () => {
  it('starts with an announced live session check and no fixture controls', () => {
    const markup = renderToStaticMarkup(createElement(LandingPage, { onNavigate: navigate }))

    expect(markup).toContain('data-session-state="loading"')
    expect(markup).toContain('data-session-view="loading"')
    expect(markup).toContain('role="status"')
    expect(markup).toContain('aria-live="polite"')
    expect(markup).not.toContain('data-session-demo="true"')
    expect(markup).not.toContain('데모 세션 상태')
  })
})
