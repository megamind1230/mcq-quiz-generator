import { describe, it, expect } from 'vitest'
import { buildExport, buildTxt, buildMd, buildOrg, buildHtml, formatExtension, type ExportData } from '../utils/quizExporter'

const data: ExportData = {
  title: 'Test Quiz',
  correct: 1,
  total: 2,
  timeTakenSeconds: 65,
  questions: [
    { question: 'What is 2 + 2?', options: ['3', '4', '5', '6'], selectedIndices: [1], correctIndices: [1], explanation: 'Basic math.' },
    { question: 'Capital of France?', options: ['London', 'Berlin', 'Paris', 'Madrid'], correctIndices: [2] }
  ]
}

describe('quizExporter', () => {
  it('builds txt with summary and per-question detail', () => {
    const out = buildTxt(data)
    expect(out).toContain('Test Quiz')
    expect(out).toContain('1/2 (50%)')
    expect(out).toContain('[Correct]')
    expect(out).toContain('Selected: B')
    expect(out).toContain('Explanation: Basic math.')
    expect(out).toContain('[Skipped]')
  })

  it('builds markdown', () => {
    const out = buildMd(data)
    expect(out).toContain('# Test Quiz')
    expect(out).toContain('**Score:** 1/2 (50%)')
    expect(out).toContain('## Q1 — Correct')
    expect(out).toContain('- **Answer:** C')
  })

  it('builds org', () => {
    const out = buildOrg(data)
    expect(out).toContain('#+TITLE: Test Quiz')
    expect(out).toContain('* Score: 1/2 (50%)')
    expect(out).toContain('** Question 1 [Correct]')
    expect(out).toContain('- Answer:   C')
  })

  it('builds self-contained html', () => {
    const css = { katexCss: '.katex{}', hljsCss: '.hljs{}' }
    const out = buildHtml(data, css)
    expect(out).toContain('<!DOCTYPE html>')
    expect(out).toContain('<title>Test Quiz — Results</title>')
    expect(out).toContain('Score: 1/2 (50%)')
    expect(out).toContain('.katex{}')
    expect(out).toContain('.hljs{}')
  })

  it('buildExport dispatches by format and pdf uses html', () => {
    expect(buildExport('md', data)).toBe(buildMd(data))
    expect(buildExport('org', data)).toBe(buildOrg(data))
    expect(buildExport('txt', data)).toBe(buildTxt(data))
    expect(buildExport('html', data)).toBe(buildHtml(data))
    expect(buildExport('pdf', data)).toBe(buildHtml(data))
  })

  it('maps format extensions', () => {
    expect(formatExtension('pdf')).toBe('pdf')
    expect(formatExtension('org')).toBe('org')
  })

  it('grades multi-answer exactly and lists all letters', () => {
    const multi: ExportData = {
      title: 'Multi Quiz',
      correct: 2,
      total: 2,
      timeTakenSeconds: 30,
      questions: [
        { question: 'Primes?', options: ['2', '4', '5', '9'], selectedIndices: [0, 2], correctIndices: [0, 2] },
        { question: 'Wrong partial?', options: ['a', 'b', 'c', 'd'], selectedIndices: [0], correctIndices: [0, 1] }
      ]
    }
    const md = buildMd(multi)
    expect(md).toContain('**Score:** 2/2 (100%)')
    expect(md).toContain('## Q1 — Correct')
    expect(md).toContain('- **Selected:** A, C')
    expect(md).toContain('- **Answer:** A, C')
    expect(md).toContain('## Q2 — Wrong')
    expect(md).toContain('- **Answer:** A, B')
  })
})

