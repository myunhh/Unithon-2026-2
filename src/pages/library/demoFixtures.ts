export const LIBRARY_DEMO_MODES = ['has-more', 'empty', 'error', 'loading'] as const

export type LibraryDemoMode = (typeof LIBRARY_DEMO_MODES)[number]

export type LibraryDemoDocument = {
  readonly key: string
  readonly title: string
  readonly details: string
  readonly statusLabel: string
  readonly statusTone: 'ready' | 'working' | 'error'
  readonly pageCount: number | null
  readonly lastOpened: string
  readonly highlightCount: number
}

export type LibraryDemoPage = {
  readonly pageNumber: number
  readonly totalPages: number
  readonly savedCount: number
  readonly items: readonly LibraryDemoDocument[]
  readonly hasNextPage: boolean
}

export type LibraryDemoViewState = {
  readonly mode: LibraryDemoMode
  readonly pageIndex: number
}

const FIRST_PAGE: LibraryDemoPage = {
  pageNumber: 1,
  totalPages: 2,
  savedCount: 12,
  hasNextPage: true,
  items: [
    {
      key: 'demo-document-1',
      title: 'Attention Is All You Need',
      details: 'PDF · 15쪽 · 2026. 08. 25. 14:02',
      statusLabel: '완료',
      statusTone: 'ready',
      pageCount: 15,
      lastOpened: '2026-08-25 14:02',
      highlightCount: 8,
    },
    {
      key: 'demo-document-2',
      title: 'Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks',
      details: 'PDF · 19쪽 · 2026. 08. 25. 13:41',
      statusLabel: '파싱 중',
      statusTone: 'working',
      pageCount: 19,
      lastOpened: '2026-08-25 13:41',
      highlightCount: 0,
    },
    {
      key: 'demo-document-3',
      title: 'Scanned_Lecture_Notes_2019.pdf',
      details: 'PDF · 쪽 수 확인 중 · 2026. 08. 24. 22:10',
      statusLabel: '실패',
      statusTone: 'error',
      pageCount: null,
      lastOpened: '2026-08-24 22:10',
      highlightCount: 0,
    },
    {
      key: 'demo-document-4',
      title: 'Denoising Diffusion Probabilistic Models',
      details: 'PDF · 25쪽 · 2026. 08. 23. 09:18',
      statusLabel: '완료',
      statusTone: 'ready',
      pageCount: 25,
      lastOpened: '2026-08-23 09:18',
      highlightCount: 21,
    },
    {
      key: 'demo-document-5',
      title: 'Deep Residual Learning for Image Recognition',
      details: 'PDF · 12쪽 · 2026. 08. 21. 17:55',
      statusLabel: '완료',
      statusTone: 'ready',
      pageCount: 12,
      lastOpened: '2026-08-21 17:55',
      highlightCount: 4,
    },
  ],
}

const SECOND_PAGE: LibraryDemoPage = {
  pageNumber: 2,
  totalPages: 2,
  savedCount: 12,
  hasNextPage: false,
  items: [
    {
      key: 'demo-document-6',
      title: 'Notes on Open Research Practice',
      details: 'PDF · 9쪽 · 2026. 08. 22. 14:08',
      statusLabel: '완료',
      statusTone: 'ready',
      pageCount: 9,
      lastOpened: '2026-08-22 14:08',
      highlightCount: 3,
    },
    {
      key: 'demo-document-7',
      title: 'A Practical Guide to Source Comparison',
      details: 'PDF · 16쪽 · 2026. 08. 20. 11:31',
      statusLabel: '파싱 중',
      statusTone: 'working',
      pageCount: 16,
      lastOpened: '2026-08-20 11:31',
      highlightCount: 0,
    },
  ],
}

const DEMO_PAGES: readonly LibraryDemoPage[] = [FIRST_PAGE, SECOND_PAGE]

export function getDemoPage(pageIndex: number): LibraryDemoPage {
  return DEMO_PAGES[pageIndex] ?? FIRST_PAGE
}

export function selectDemoMode(mode: LibraryDemoMode): LibraryDemoViewState {
  return { mode, pageIndex: 0 }
}

export function advanceDemoPage(state: LibraryDemoViewState): LibraryDemoViewState {
  if (state.mode !== 'has-more') return state

  const currentPage = getDemoPage(state.pageIndex)
  if (!currentPage.hasNextPage) return state

  return { mode: state.mode, pageIndex: state.pageIndex + 1 }
}

export function retryDemoList(): LibraryDemoViewState {
  return { mode: 'has-more', pageIndex: 0 }
}
