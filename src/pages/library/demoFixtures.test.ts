import { describe, expect, it } from 'vitest'
import {
  advanceDemoPage,
  getDemoPage,
  retryDemoList,
  selectDemoMode,
  type LibraryDemoViewState,
} from './demoFixtures'

describe('library cursor demo seam', () => {
  it('starts the has-more interaction on the first page', () => {
    const state = selectDemoMode('has-more')
    const page = getDemoPage(state.pageIndex)

    expect(page.pageNumber).toBe(1)
    expect(page.items).toHaveLength(3)
    expect(page.hasNextPage).toBe(true)
  })

  it('advances one mock cursor page and then stops', () => {
    const firstPageState: LibraryDemoViewState = selectDemoMode('has-more')
    const secondPageState = advanceDemoPage(firstPageState)
    const lastPageState = advanceDemoPage(secondPageState)

    expect(secondPageState.pageIndex).toBe(1)
    expect(getDemoPage(secondPageState.pageIndex).items).toHaveLength(2)
    expect(getDemoPage(secondPageState.pageIndex).hasNextPage).toBe(false)
    expect(lastPageState).toEqual(secondPageState)
  })

  it('resets the cursor when a different visible state is selected', () => {
    const state = advanceDemoPage(selectDemoMode('has-more'))

    expect(selectDemoMode('empty')).toEqual({ mode: 'empty', pageIndex: 0 })
    expect(selectDemoMode('loading')).toEqual({ mode: 'loading', pageIndex: 0 })
    expect(selectDemoMode('error')).toEqual({ mode: 'error', pageIndex: 0 })
    expect(state.pageIndex).toBe(1)
  })

  it('retries the error demo through the first mock page', () => {
    expect(retryDemoList()).toEqual({ mode: 'has-more', pageIndex: 0 })
  })
})
