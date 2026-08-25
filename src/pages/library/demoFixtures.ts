export const LIBRARY_DEMO_MODES = ['has-more', 'empty', 'error', 'loading'] as const

export type LibraryDemoMode = (typeof LIBRARY_DEMO_MODES)[number]

export type LibraryDemoDocument = {
  readonly key: string
  readonly title: string
  readonly details: string
  readonly statusLabel: string
  readonly statusTone: 'ready' | 'working'
}

export type LibraryDemoPage = {
  readonly pageNumber: number
  readonly totalPages: number
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
  hasNextPage: true,
  items: [
    {
      key: 'demo-document-1',
      title: 'The Shape of a Research Question',
      details: 'PDF · 12쪽 · 2026. 08. 26. 10:24',
      statusLabel: '읽을 수 있음',
      statusTone: 'ready',
    },
    {
      key: 'demo-document-2',
      title: 'Methods for Literature Mapping',
      details: 'PDF · 8쪽 · 2026. 08. 25. 16:40',
      statusLabel: '처리 중',
      statusTone: 'working',
    },
    {
      key: 'demo-document-3',
      title: 'Evidence Review Checklist',
      details: 'PDF · 5쪽 · 2026. 08. 24. 09:12',
      statusLabel: '읽을 수 있음',
      statusTone: 'ready',
    },
  ],
}

const SECOND_PAGE: LibraryDemoPage = {
  pageNumber: 2,
  totalPages: 2,
  hasNextPage: false,
  items: [
    {
      key: 'demo-document-4',
      title: 'Notes on Open Research Practice',
      details: 'PDF · 9쪽 · 2026. 08. 22. 14:08',
      statusLabel: '읽을 수 있음',
      statusTone: 'ready',
    },
    {
      key: 'demo-document-5',
      title: 'A Practical Guide to Source Comparison',
      details: 'PDF · 16쪽 · 2026. 08. 20. 11:31',
      statusLabel: '처리 중',
      statusTone: 'working',
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
