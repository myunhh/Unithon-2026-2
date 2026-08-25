import { describe, expect, it } from 'vitest'
import { createSelectionAnchor, isValidTextRange, normalizeRect } from './selection'

describe('normalizeRect', () => {
  it('clips a rectangle to normalized page coordinates', () => {
    expect(normalizeRect({ x: -0.2, y: 0.8, width: 0.6, height: 0.5 })).toEqual({
      x: 0,
      y: 0.8,
      width: 0.4,
      height: 0.2,
    })
  })
})

describe('createSelectionAnchor', () => {
  it('normalizes anchored rectangles and retains a valid text range', () => {
    const textRange = { startItemId: 't1', startOffset: 2, endItemId: 't3', endOffset: 7 }
    const anchor = createSelectionAnchor('doc-1', 3, [{ x: 0.8, y: 0.1, width: 0.4, height: 0.2 }], textRange)

    expect(anchor.rects).toEqual([{ x: 0.8, y: 0.1, width: 0.2, height: 0.2 }])
    expect(anchor.textRange).toEqual(textRange)
    expect(isValidTextRange({ ...textRange, startOffset: -1 })).toBe(false)
  })

  it('rejects missing page evidence', () => {
    expect(() => createSelectionAnchor('doc-1', 0, [{ x: 0, y: 0, width: 1, height: 1 }])).toThrow('쪽 번호는 1 이상의 정수')
    expect(() => createSelectionAnchor('doc-1', 1, [])).toThrow('사각형이 하나 이상')
  })
})
