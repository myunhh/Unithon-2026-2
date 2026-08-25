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

  it('keeps the Figma upload surface closed until the document API is available', () => {
    const markup = renderToStaticMarkup(createElement(LibraryPage, {
      onNavigate: () => undefined,
    }))

    expect(markup).toContain('<h1 class="page-title">라이브러리</h1>')
    expect(markup).toContain('type="file"')
    expect(markup).toContain('accept="application/pdf"')
    expect(markup).toContain('aria-label="문서 업로드 (준비 중)"')
    expect((markup.match(/disabled=""/g) ?? [])).toHaveLength(2)
    expect(markup).toContain('aria-disabled="true"')
    expect(markup).toContain('업로드한 논문은 비공개로 보관됩니다.')
    expect(markup).toContain('업로드와 실제 API 연결은 아직 열려 있지 않습니다.')
    expect(markup).not.toContain('업로드 선택 상태를 확인했습니다.')
  })

  it('keeps the Figma table semantics in the fixture route', () => {
    const markup = renderToStaticMarkup(createElement(LibraryPage, {
      onNavigate: () => undefined,
    }))

    expect(markup).toContain('<table class="library-document-table">')
    expect(markup).toContain('<th scope="col">하이라이트</th>')
  })
})
