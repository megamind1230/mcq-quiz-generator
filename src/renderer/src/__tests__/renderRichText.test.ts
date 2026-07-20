import { describe, it, expect, beforeEach } from 'vitest'
import { renderRichText, getRawContent } from '../utils/renderRichText'

describe('renderRichText', () => {
  it('returns plain text unchanged', () => {
    const input = 'Hello world'
    expect(renderRichText(input)).toBe('Hello world')
  })

  it('renders inline code', () => {
    const result = renderRichText('Use `console.log()` here')
    expect(result).toContain('inline-code')
    expect(result).toContain('console.log()')
  })

  it('renders fenced code blocks with copy button', () => {
    const input = '```js\nconst x = 1;\n```'
    const result = renderRichText(input)
    expect(result).toContain('code-block')
    expect(result).toContain('copy-btn')
    expect(result).toContain('hljs')
    expect(result).toContain('const')
  })

  it('renders display math', () => {
    const input = '$$E = mc^2$$'
    const result = renderRichText(input)
    expect(result).toContain('katex')
    expect(result).toContain('copy-btn')
  })

  it('renders inline math', () => {
    const input = 'The formula $x^2$ is here'
    const result = renderRichText(input)
    expect(result).toContain('inline-math')
    expect(result).toContain('katex')
  })

  it('converts newlines to <br>', () => {
    const result = renderRichText('line1\nline2')
    expect(result).toContain('<br>')
  })

  it('getRawContent retrieves stored content', () => {
    renderRichText('`test code`')
    // rawContentMap is internal, but we can verify the copy-btn has a data-copy-id
    const result = renderRichText('`hello`')
    const match = result.match(/data-copy-id="([^"]+)"/)
    expect(match).not.toBeNull()
    const raw = getRawContent(match![1])
    expect(raw).toBe('hello')
  })
})
