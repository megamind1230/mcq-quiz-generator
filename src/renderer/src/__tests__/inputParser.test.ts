import { describe, it, expect } from 'vitest'
import { extractContent } from '../utils/inputParser'

describe('extractContent', () => {
  describe('.txt files', () => {
    it('returns raw content unchanged', () => {
      const input = 'Hello world\nLine 2'
      expect(extractContent(input, '.txt')).toBe(input)
    })
  })

  describe('.md files', () => {
    it('strips YAML frontmatter', () => {
      const input = `---
title: Test
---

# Heading
Content here`
      const result = extractContent(input, '.md')
      expect(result).not.toContain('title: Test')
      expect(result).toContain('Heading')
      expect(result).toContain('Content here')
    })

    it('strips markdown headings', () => {
      const input = '# H1\n## H2\n### H3\nText'
      const result = extractContent(input, '.md')
      expect(result).toBe('H1\nH2\nH3\nText')
    })

    it('strips bold/italic markers', () => {
      const input = '**bold** and *italic* and __under__ and _under2_'
      const result = extractContent(input, '.md')
      expect(result).toBe('bold and italic and under and under2')
    })

    it('handles no frontmatter', () => {
      const input = '# Just content\nHello'
      const result = extractContent(input, '.md')
      expect(result).toContain('Just content')
      expect(result).toContain('Hello')
    })
  })

  describe('.org files', () => {
    it('strips org metadata lines', () => {
      const input = [
        '#+TITLE: Test',
        '#+AUTHOR: Me',
        'Some content here'
      ].join('\n')
      const result = extractContent(input, '.org')
      expect(result).not.toContain('#+TITLE:')
      expect(result).not.toContain('#+AUTHOR:')
      expect(result).toContain('Some content here')
    })

    it('strips org bold/italic/code markup', () => {
      const input = '*bold* /italic/ =code='
      const result = extractContent(input, '.org')
      expect(result).toBe('bold italic code')
    })

    it('skips org block content between BEGIN/END', () => {
      const input = [
        '#+BEGIN_SRC python',
        'print("hello")',
        '#+END_SRC'
      ].join('\n')
      const result = extractContent(input, '.org')
      expect(result).not.toContain('#+BEGIN_SRC')
      expect(result).not.toContain('#+END_SRC')
      expect(result).not.toContain('print("hello")')
    })
  })
})
