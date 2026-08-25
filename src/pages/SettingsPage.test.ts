import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SettingsPage } from './SettingsPage'

describe('SettingsPage provider availability semantics', () => {
  it('uses a labelled, stacked list instead of a clipped data table', () => {
    const markup = renderToStaticMarkup(createElement(SettingsPage))

    expect(markup).toContain('<div class="settings-summary" role="group" aria-label="제공자 환경 요약">')
    expect(markup).toContain('<ul class="settings-cli-list" aria-label="제공자 연결 상태">')
    expect(markup).toContain('<h2 class="settings-cli-provider-name">Claude Code</h2>')
    expect(markup).toContain('<h2 class="settings-cli-provider-name">Codex</h2>')
    expect(markup).toContain('<h2 class="settings-cli-provider-name">Agy</h2>')
    expect(markup).toContain('<dt>확인 결과</dt>')
    expect(markup).toContain('<dt>상태</dt>')
    expect(markup).not.toContain('settings-cli-table')
  })
})
