import { describe, it, expect } from 'vitest'
import { parseMcqFile } from '../utils/mcqParser'

describe('parseMcqFile', () => {
  it('parses a valid .mcq file', () => {
    const input = `---
title: Test Quiz
source: test.md
generated: 2026-07-20
---

## Question 1
What is 2 + 2?

A. 3
B. 4
C. 5
D. 6

**[Answer: B]**
**Explanation:** Basic arithmetic.

---

## Question 2
Capital of France?

A. London
B. Berlin
C. Paris
D. Madrid

**[Answer: C]**
`

    const result = parseMcqFile(input)
    expect(result).not.toBeNull()
    expect(result!.title).toBe('Test Quiz')
    expect(result!.source).toBe('test.md')
    expect(result!.generated).toBe('2026-07-20')
    expect(result!.questions).toHaveLength(2)

    expect(result!.questions[0].question).toBe('What is 2 + 2?')
    expect(result!.questions[0].options).toEqual(['3', '4', '5', '6'])
    expect(result!.questions[0].correctIndices).toEqual([1])
    expect(result!.questions[0].multiAnswer).toBe(false)
    expect(result!.questions[0].explanation).toBe('Basic arithmetic.')

    expect(result!.questions[1].question).toBe('Capital of France?')
    expect(result!.questions[1].correctIndices).toEqual([2])
    expect(result!.questions[1].multiAnswer).toBe(false)
    expect(result!.questions[1].explanation).toBeUndefined()
  })

  it('returns null for empty input', () => {
    expect(parseMcqFile('')).toBeNull()
  })

  it('returns null when no questions found', () => {
    const input = `---
title: Empty
---
`
    expect(parseMcqFile(input)).toBeNull()
  })

  it('handles missing frontmatter', () => {
    const input = `## Question 1
Test?

A. 1
B. 2
C. 3
D. 4

**[Answer: A]**
`
    const result = parseMcqFile(input)
    expect(result).not.toBeNull()
    expect(result!.title).toBe('Untitled Quiz')
    expect(result!.questions).toHaveLength(1)
  })

  it('handles quoted YAML values', () => {
    const input = `---
title: "My Quiz"
source: 'notes.md'
---

## Question 1
Q?

A. 1
B. 2
C. 3
D. 4

**[Answer: B]**
`
    const result = parseMcqFile(input)
    expect(result!.title).toBe('My Quiz')
    expect(result!.source).toBe('notes.md')
  })

  it('skips blocks without valid question format', () => {
    const input = `---
title: Partial
---

## Question 1
Valid question?

A. 1
B. 2
C. 3
D. 4

**[Answer: A]**

---

This is not a question block

---

## Question 2
Another valid?

A. a
B. b
C. c
D. d

**[Answer: C]**
`
    const result = parseMcqFile(input)
    expect(result!.questions).toHaveLength(2)
  })

  it('parses multi-answer syntax', () => {
    const input = `---
title: Multi
source: multi.md
---

## Question 1
Select prime numbers

A. 2
B. 4
C. 5
D. 9

**[Answer:A,C]**
`
    const result = parseMcqFile(input)
    expect(result).not.toBeNull()
    expect(result!.questions[0].correctIndices).toEqual([0, 2])
    expect(result!.questions[0].multiAnswer).toBe(true)
  })
})
