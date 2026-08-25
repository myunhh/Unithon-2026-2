import type { NormRect, SelectionAnchor, TextRange } from './types'

const clampUnit = (value: number) => Math.min(1, Math.max(0, value))
const stableUnit = (value: number) => Math.round(value * 1_000_000) / 1_000_000

export function normalizeRect(rect: NormRect): NormRect {
  const left = clampUnit(rect.x)
  const top = clampUnit(rect.y)
  const right = clampUnit(rect.x + Math.max(0, rect.width))
  const bottom = clampUnit(rect.y + Math.max(0, rect.height))

  return {
    x: stableUnit(left),
    y: stableUnit(top),
    width: stableUnit(right - left),
    height: stableUnit(bottom - top),
  }
}

export function isValidTextRange(range: TextRange): boolean {
  return range.startOffset >= 0 && range.endOffset >= 0 && Boolean(range.startItemId) && Boolean(range.endItemId)
}

export function createSelectionAnchor(
  documentId: string,
  pageNumber: number,
  rects: readonly NormRect[],
  textRange?: TextRange,
): SelectionAnchor {
  if (!documentId) throw new Error('선택 영역에 문서 ID가 필요합니다.')
  if (!Number.isInteger(pageNumber) || pageNumber < 1) throw new Error('선택 영역의 쪽 번호는 1 이상의 정수여야 합니다.')
  if (rects.length === 0) throw new Error('선택 영역에는 사각형이 하나 이상 필요합니다.')
  if (textRange && !isValidTextRange(textRange)) throw new Error('입력한 텍스트 범위가 올바르지 않습니다.')

  return {
    documentId,
    pageNumber,
    rects: rects.map(normalizeRect),
    ...(textRange ? { textRange } : {}),
  }
}
