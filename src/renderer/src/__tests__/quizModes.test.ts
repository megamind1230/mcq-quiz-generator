import { describe, it, expect } from 'vitest'
import { advanceLoop, BLOCK_SIZE, exactMatch, isAnswered, type QuizMode } from '../utils/quizModes'
import type { McqQuestion } from '../types'

function q(num: number, correct = 0): McqQuestion {
  return {
    question: `Q${num}`,
    options: ['a', 'b', 'c', 'd'],
    correctIndices: [correct],
    multiAnswer: false,
    selectedIndices: undefined
  }
}

describe('quizModes', () => {
  it('QuizMode type is a string union', () => {
    const mode: QuizMode = 'loop'
    expect(mode).toBe('loop')
  })

  it('exactMatch is all-or-nothing on selection sets', () => {
    expect(exactMatch({ ...q(1), selectedIndices: [0] })).toBe(true)
    expect(exactMatch({ ...q(1, 1), selectedIndices: [0] })).toBe(false)
    expect(exactMatch(q(1))).toBe(false)
    expect(exactMatch({ ...q(2), correctIndices: [0, 1], selectedIndices: [1, 0], multiAnswer: true })).toBe(true)
    expect(exactMatch({ ...q(2), correctIndices: [0, 1], selectedIndices: [0], multiAnswer: true })).toBe(false)
  })

  it('isAnswered is false until a selection exists', () => {
    expect(isAnswered(q(1))).toBe(false)
    expect(isAnswered({ ...q(1), selectedIndices: [1] })).toBe(true)
  })

  it('blocks the pool into chunks of BLOCK_SIZE', () => {
    const pool = Array.from({ length: 33 }, (_, i) => q(i))
    const batch = pool.slice(0, BLOCK_SIZE)
    const next = advanceLoop(pool, batch)
    expect(next.pool.length).toBe(33)
    expect(next.batch.length).toBe(BLOCK_SIZE)
  })

  it('re-queues wrong answers to the front of the next batch', () => {
    const pool = Array.from({ length: 20 }, (_, i) => q(i))
    const batch = pool.slice(0, BLOCK_SIZE).map((x, i) => (i % 2 === 0 ? x : { ...x, selectedIndices: [0] }))
    const next = advanceLoop(pool, batch)
    expect(next.done).toBe(false)
    expect(next.pool.length).toBe(13)
    expect(next.batch[0].question).toBe('Q0')
  })

  it('loops until the pool is empty (all mastered)', () => {
    const pool = Array.from({ length: 17 }, (_, i) => q(i))
    let state = { done: false, pool, batch: pool.slice(0, BLOCK_SIZE) }
    let passes = 0
    while (!state.done && passes < 20) {
      const answered = state.batch.map((x, i) => (i === 0 ? { ...x, selectedIndices: [x.correctIndices[0]] } : x))
      state = advanceLoop(state.pool, answered)
      passes++
    }
    expect(state.done).toBe(true)
    expect(state.pool.length).toBe(0)
  })

  it('handles a partial final block', () => {
    const pool = Array.from({ length: 5 }, (_, i) => q(i))
    const batch = pool.slice(0, BLOCK_SIZE)
    const answered = batch.map(x => ({ ...x, selectedIndices: [x.correctIndices[0]] }))
    const next = advanceLoop(pool, answered)
    expect(next.done).toBe(true)
    expect(next.pool.length).toBe(0)
    expect(next.batch.length).toBe(0)
  })
})