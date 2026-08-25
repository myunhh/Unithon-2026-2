import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SettingsPage } from './SettingsPage'

describe('SettingsPage provider availability semantics', () => {
  it('uses a labelled, stacked list instead of a clipped data table', () => {
    const markup = renderToStaticMarkup(createElement(SettingsPage))

    expect(markup).toContain('<ul class="settings-cli-list" aria-label="제공자 연결 상태">')
    expect(markup).toContain('<h3 class="settings-cli-provider-name">Claude Code</h3>')
    expect(markup).toContain('<h3 class="settings-cli-provider-name">Codex</h3>')
    expect(markup).toContain('<h3 class="settings-cli-provider-name">Agy</h3>')
    expect(markup).toContain('<dt>확인 결과</dt>')
    expect(markup).toContain('<dt>상태</dt>')
    expect(markup).not.toContain('settings-cli-table')
  })
})
