import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createReaderFixtureGraph } from './reader-fixtures'
import { ReaderToolbar } from './ReaderToolbar'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('reader accessibility semantics', () => {
  it('names the reader controls and fixture surface through permitted roles', async () => {
    const toolbarMarkup = renderToStaticMarkup(createElement(ReaderToolbar, {
      documentId: 'fixture-reader',
      pageCount: 3,
      currentPage: 1,
      zoom: 1.2,
      showAllPages: false,
      fileStatus: 'ready',
      parseStatus: 'ready',
      parseError: null,
      sourceLabel: 'demo',
      onBackToLibrary: () => undefined,
      onPageChange: () => undefined,
      onZoomChange: () => undefined,
      onToggleAllPages: () => undefined,
    }))
    vi.stubGlobal('DOMMatrix', class DOMMatrixStub {})
    const { ReaderFixturePage } = await import('./PdfPageCanvas')
    const page = createReaderFixtureGraph().pages[0]
    if (!page) throw new TypeError('Reader fixture must expose its first page.')
    const fixtureMarkup = renderToStaticMarkup(createElement(ReaderFixturePage, {
      pageNumber: 1,
      page,
      zoom: 1.2,
      rotation: 0,
      isKeyboardFocusable: true,
    }))

    expect(toolbarMarkup).toContain('<h1 class="visually-hidden">PDF 리더: fixture-reader</h1>')
    expect(toolbarMarkup).toContain('class="reader-controls" role="group"')
    expect(toolbarMarkup).toContain('aria-label="PDF 쪽과 확대/축소 조절"')
    expect(fixtureMarkup).toContain('class="pdf-page-surface reader-fixture-surface" role="document"')
    expect(fixtureMarkup).toContain('aria-label="본문 없이 페이지 기하와 뷰포트 상태만 확인하는 데모"')
  })
})
