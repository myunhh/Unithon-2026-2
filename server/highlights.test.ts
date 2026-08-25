import { describe, expect, it } from 'vitest'
import {
  highlightStateIdForSession,
  HighlightRepository,
  type HighlightState,
  type HighlightStateGateway,
} from './highlights.js'

const sessionId = '0123456789abcdefghijklmnopqrstuv'
const documentId = '11111111-1111-4111-8111-111111111111'

function memoryGateway(): HighlightStateGateway {
  let revision = 0
  let state: HighlightState = { version: 1, highlights: [] }
  return {
    read: async () => ({ revision, state }),
    write: async (expectedRevision, nextState) => {
      if (expectedRevision !== revision) return { saved: false }
      revision += 1
      state = nextState
      return { saved: true, revision }
    },
  }
}

describe('highlight repository', () => {
  it('persists normalized selection anchors in a document-scoped state key', async () => {
    const repository = new HighlightRepository(memoryGateway(), documentId)
    const highlight = await repository.create({
      anchor: {
        pageNumber: 2,
        rects: [{ x: -0.1, y: 0.9, width: 0.4, height: 0.3 }],
        selectedText: 'A selected statement',
      },
      context: 'The surrounding block context.',
    })

    expect(highlight.anchor.rects).toEqual([{ x: 0, y: 0.9, width: 0.3, height: 0.1 }])
    expect((await repository.list()).map((item) => item.id)).toEqual([highlight.id])
    expect(await repository.remove(highlight.id)).toBe(true)
    expect(await repository.list()).toEqual([])
    expect(highlightStateIdForSession(sessionId, documentId)).toBe(`paperbridge:reader:highlights:${sessionId}:${documentId}`)
  })
})
