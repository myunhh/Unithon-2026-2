import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { LoginPage } from '../LoginPage'

describe('LoginPage accessibility contract', () => {
  it('renders labelled keyboard-ready controls for the live authentication flow', () => {
    const markup = renderToStaticMarkup(createElement(LoginPage, {
      onNavigate: vi.fn(),
      onAuthenticated: vi.fn(),
    }))

    expect(markup).not.toContain('data-demo-only="true"')
    expect(markup).toContain('aria-label="로그인 및 가입"')
    expect(markup).toContain('role="tablist"')
    expect(markup).toContain('role="tab"')
    expect(markup).toContain('aria-selected="true"')
    expect(markup).toContain('aria-selected="false"')
    expect(markup).toContain('id="login-email"')
    expect(markup).toContain('for="login-email"')
    expect(markup).toContain('aria-describedby="login-email-help"')
    expect(markup).toContain('id="login-form"')
    expect(markup).toContain('noValidate')
  })

  it('does not describe the authentication flow as a demo', () => {
    const markup = renderToStaticMarkup(createElement(LoginPage, {
      onNavigate: () => undefined,
      onAuthenticated: () => undefined,
    }))

    expect(markup).toContain('로그인</button>')
    expect(markup).not.toContain('실제 요청은 전송되지 않습니다.')
    expect(markup).not.toContain('데모 모드')
  })
})
