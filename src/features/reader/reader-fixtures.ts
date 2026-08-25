import type { Page, PdfObjectGraph } from '../../domain/types'
import { READER_FIXTURE_DOCUMENT_ID } from './reader-state'

const FIXTURE_PAGE_WIDTH = 612
const FIXTURE_PAGE_HEIGHT = 792
const FIXTURE_PAGE_COUNT = 3

function fixturePage(pageNumber: number): Page {
  return {
    id: `fixture-page-${pageNumber}`,
    pageNumber,
    width: FIXTURE_PAGE_WIDTH,
    height: FIXTURE_PAGE_HEIGHT,
    rotation: 0,
    textItems: [],
    lines: [],
    blocks: [],
  }
}

export function createReaderFixtureGraph(documentId = READER_FIXTURE_DOCUMENT_ID): PdfObjectGraph {
  return {
    documentId,
    version: 1,
    pages: Array.from({ length: FIXTURE_PAGE_COUNT }, (_, index) => fixturePage(index + 1)),
    createdAt: '2026-01-01T00:00:00.000Z',
  }
}

export function isReaderFixture(documentId: string): boolean {
  return documentId === READER_FIXTURE_DOCUMENT_ID
}

export const readerFixtureDetails = {
  sourceLabel: '데모 fixture',
  title: 'Synthetic reader fixture',
  description: '실제 PDF 본문 없이 페이지·확대·선택 상태를 확인하는 안전한 데모입니다.',
} as const
