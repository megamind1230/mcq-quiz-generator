import type { McqQuestion } from '../types'

export const BLOCK_SIZE = 15
export type QuizMode = 'loop' | 'normal'

export function exactMatch(q: McqQuestion): boolean {
  if (!q.selectedIndices || q.selectedIndices.length === 0) return false
  const a = [...q.selectedIndices].sort().join(',')
  const b = [...q.correctIndices].sort().join(',')
  return a === b
}

export function isAnswered(q: McqQuestion): boolean {
  return !!(q.selectedIndices && q.selectedIndices.length > 0)
}

export interface LoopAdvance {
  done: boolean
  pool: McqQuestion[]
  batch: McqQuestion[]
}

export function advanceLoop(pool: McqQuestion[], batch: McqQuestion[]): LoopAdvance {
  const wrong = batch.filter(q => !exactMatch(q))
  const rest = pool.slice(batch.length)
  const remaining = [...wrong, ...rest]
  return {
    done: remaining.length === 0,
    pool: remaining,
    batch: remaining.slice(0, BLOCK_SIZE).map(q => ({ ...q, selectedIndices: undefined }))
  }
}