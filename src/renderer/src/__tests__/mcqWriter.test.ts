import { describe, it, expect } from 'vitest'
import { serializeMcq } from '../utils/mcqWriter'
import type { McqDocument } from '../types'

describe('serializeMcq', () => {
  it('serializes a complete document', () => {
    const doc: McqDocument = {
      title: 'Test Quiz',
      source: 'test.md',
      generated: '2026-07-20',
      questions: [
        {
          question: 'What is 2 + 2?',
          options: ['3', '4', '5', '6'],
          correctIndices: [1],
          multiAnswer: false,
          explanation: 'Basic math.'
        }
      ]
    }

    const output = serializeMcq(doc)
    expect(output).toContain('---')
    expect(output).toContain('title: Test Quiz')
    expect(output).toContain('source: test.md')
    expect(output).toContain('generated: 2026-07-20')
    expect(output).toContain('## Question 1')
    expect(output).toContain('What is 2 + 2?')
    expect(output).toContain('A. 3')
    expect(output).toContain('B. 4')
    expect(output).toContain('**[Answer: B]**')
    expect(output).toContain('**Explanation:** Basic math.')
  })

  it('omits source/generated when empty', () => {
    const doc: McqDocument = {
      title: 'Minimal',
      source: '',
      generated: '',
      questions: [
        {
          question: 'Q?',
          options: ['a', 'b', 'c', 'd'],
          correctIndices: [0],
          multiAnswer: false
        }
      ]
    }

    const output = serializeMcq(doc)
    expect(output).not.toContain('source:')
    expect(output).not.toContain('generated:')
    expect(output).not.toContain('Explanation:')
  })

  it('roundtrips with parseMcqFile', async () => {
    const { parseMcqFile } = await import('../utils/mcqParser')
    const doc: McqDocument = {
      title: 'Roundtrip',
      source: 'src.md',
      generated: '2026-07-20',
      questions: [
        {
          question: 'Test question?',
          options: ['opt A', 'opt B', 'opt C', 'opt D'],
          correctIndices: [2],
          multiAnswer: false,
          explanation: 'Because.'
        },
        {
          question: 'Second one?',
          options: ['x', 'y', 'z', 'w'],
          correctIndices: [0],
          multiAnswer: false
        }
      ]
    }

    const serialized = serializeMcq(doc)
    const parsed = parseMcqFile(serialized)

    expect(parsed).not.toBeNull()
    expect(parsed!.title).toBe(doc.title)
    expect(parsed!.source).toBe(doc.source)
    expect(parsed!.questions).toHaveLength(2)
    expect(parsed!.questions[0].question).toBe(doc.questions[0].question)
    expect(parsed!.questions[0].correctIndices).toEqual(doc.questions[0].correctIndices)
    expect(parsed!.questions[1].correctIndices).toEqual(doc.questions[1].correctIndices)
  })

  it('serializes multi-answer questions with bracket syntax', () => {
    const doc: McqDocument = {
      title: 'Multi',
      source: 's.md',
      generated: '2026-07-20',
      questions: [
        {
          question: 'Pick primes?',
          options: ['2', '4', '5', '9'],
          correctIndices: [0, 2],
          multiAnswer: true
        }
      ]
    }

    const output = serializeMcq(doc)
    expect(output).toContain('**[Answer:A,C]**')
  })
})
