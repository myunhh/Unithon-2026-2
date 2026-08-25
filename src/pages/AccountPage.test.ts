import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AccountPage } from './AccountPage'

describe('AccountPage device-session demo', () => {
  it('renders an explicit presentation-only device session seam', () => {
    const markup = renderToStaticMarkup(createElement(AccountPage, {
      onNavigate: () => undefined,
      onLoggedOut: () => undefined,
    }))

    expect(markup).toContain('account-session-panel')
    expect(markup).toContain('<div class="account-session-summary" role="group" aria-label="기기 세션 요약">')
    expect(markup).toContain('데모 상태')
    expect(markup).toContain('현재 기기')
    expect(markup).toContain('연결 해제')
  })
})
