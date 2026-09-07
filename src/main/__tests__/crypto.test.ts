import { describe, it, expect } from 'vitest'
import { encryptMcq, decryptMcq, isEncrypted } from '../crypto'

describe('crypto', () => {
  it('round-trips encrypted content', () => {
    const plain = `---
title: My Quiz
---

## Question 1
What is 2 + 2?

A. 3
B. 4

**Answer:** B
`
    const encrypted = encryptMcq(plain)
    expect(encrypted).not.toBe(plain)
    expect(isEncrypted(encrypted)).toBe(true)
    expect(decryptMcq(encrypted)).toBe(plain)
  })

  it('produces unique ciphertext per call (random IV)', () => {
    const plain = 'same input'
    expect(encryptMcq(plain)).not.toBe(encryptMcq(plain))
  })

  it('passes through non-encrypted content unchanged', () => {
    const plain = '## Question 1\nplain text\n'
    expect(isEncrypted(plain)).toBe(false)
    expect(decryptMcq(plain)).toBe(plain)
  })

  it('returns null for tampered payload', () => {
    const encrypted = encryptMcq('secret answer')
    const [header, body] = encrypted.split('|')
    const [iv, tag, data] = body.split(':')
    const altered = data.slice(0, 4) + (data[4] === 'A' ? 'B' : 'A') + data.slice(5)
    const tampered = `${header}|${iv}:${tag}:${altered}`
    expect(decryptMcq(tampered)).toBeNull()
  })

  it('returns null for malformed header', () => {
    expect(decryptMcq('encrypted-mcq-v1|only-one-part')).toBeNull()
  })
})
