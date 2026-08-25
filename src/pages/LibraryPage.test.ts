import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { LibraryPage } from './LibraryPage'

describe('LibraryPage accessibility semantics', () => {
  it('gives every labelled collection a permitted landmark or group role', () => {
    const markup = renderToStaticMarkup(createElement(LibraryPage, {
      onNavigate: () => undefined,
    }))

    expect(markup).toContain('<div class="library-page-indicator" role="group" aria-label="데모 페이지">')
    expect(markup).toContain('<nav class="library-pagination" aria-label="데모 페이지 이동">')
    expect(markup).toContain('<div class="library-demo-stats" role="group" aria-label="문서 목록 데모 요약">')
  })
})
