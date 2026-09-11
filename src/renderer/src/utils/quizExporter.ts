import { renderRichText } from './renderRichText'
import { exactMatch } from './quizModes'
import { formatTime, escapeHtml } from './format'
import { ANSWER_LABELS } from './constants'

export type ExportFormat = 'txt' | 'md' | 'org' | 'html' | 'pdf'

export interface ExportCss {
  katexCss: string
  hljsCss: string
}

export function buildExport(format: ExportFormat, data: ExportData, css?: ExportCss): string {
  switch (format) {
    case 'md': return buildMd(data)
    case 'org': return buildOrg(data)
    case 'html': return buildHtml(data, css)
    case 'pdf': return buildHtml(data, css)
    case 'txt': return buildTxt(data)
  }
}

const EXTENSIONS: Record<ExportFormat, string> = {
  txt: 'txt', md: 'md', org: 'org', html: 'html', pdf: 'pdf'
}

export function formatExtension(format: ExportFormat): string {
  return EXTENSIONS[format]
}

export interface ExportData {
  title: string
  correct: number
  total: number
  timeTakenSeconds: number
  questions: { question: string; options: string[]; selectedIndices?: number[]; correctIndices: number[]; explanation?: string }[]
}

function statusOf(q: ExportData['questions'][number]): { label: string; correct: boolean } {
  if (!q.selectedIndices || q.selectedIndices.length === 0) return { label: 'Skipped', correct: false }
  const ok = exactMatch(q)
  return { label: ok ? 'Correct' : 'Wrong', correct: ok }
}

function letters(indices: number[]): string {
  return indices.map(i => ANSWER_LABELS[i]).join(', ')
}

function percent(data: ExportData): number {
  return Math.round((data.correct / data.total) * 100)
}

// ── Text: strip light markdown for plain-text readability ──────
function stripMarkdown(s: string): string {
  return s
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\$\$([\s\S]*?)\$\$/g, '$1')
    .replace(/\$([^$\n]+?)\$/g, '$1')
}

export function buildTxt(data: ExportData): string {
  const lines: string[] = []
  lines.push(data.title)
  lines.push('='.repeat(data.title.length))
  lines.push('')
  lines.push(`Score: ${data.correct}/${data.total} (${percent(data)}%)`)
  lines.push(`Time taken: ${formatTime(data.timeTakenSeconds)}`)
  lines.push('')
  data.questions.forEach((q, i) => {
    const st = statusOf(q)
    lines.push(`${i + 1}. [${st.label}] ${stripMarkdown(q.question)}`)
    const showCorrect = !st.correct && !!(q.selectedIndices && q.selectedIndices.length)
    if (q.selectedIndices && q.selectedIndices.length) {
      lines.push(`   Selected: ${letters(q.selectedIndices)}`)
    }
    if (showCorrect) {
      lines.push(`   Answer:   ${letters(q.correctIndices)}`)
    }
    if (q.explanation) lines.push(`   Explanation: ${stripMarkdown(q.explanation)}`)
    lines.push('')
  })
  return lines.join('\n')
}

// ── Markdown ────────────────────────────────────────────────────
export function buildMd(data: ExportData): string {
  const lines: string[] = []
  lines.push(`# ${data.title}`)
  lines.push('')
  lines.push(`**Score:** ${data.correct}/${data.total} (${percent(data)}%)`)
  lines.push('')
  lines.push(`**Time taken:** ${formatTime(data.timeTakenSeconds)}`)
  lines.push('')
  data.questions.forEach((q, i) => {
    const st = statusOf(q)
    lines.push(`## Q${i + 1} — ${st.label}`)
    lines.push('')
    lines.push(q.question)
    lines.push('')
    lines.push(`- **Selected:** ${q.selectedIndices && q.selectedIndices.length ? letters(q.selectedIndices) : '—'}`)
    lines.push(`- **Answer:** ${letters(q.correctIndices)}`)
    if (q.explanation) lines.push(`- **Explanation:** ${q.explanation}`)
    lines.push('')
  })
  return lines.join('\n')
}

// ── Org ─────────────────────────────────────────────────────────
export function buildOrg(data: ExportData): string {
  const lines: string[] = []
  lines.push(`#+TITLE: ${data.title}`)
  lines.push('')
  lines.push(`* Score: ${data.correct}/${data.total} (${percent(data)}%)`)
  lines.push(`* Time taken: ${formatTime(data.timeTakenSeconds)}`)
  lines.push('')
  data.questions.forEach((q, i) => {
    const st = statusOf(q)
    lines.push(`** Question ${i + 1} [${st.label}]`)
    lines.push(q.question)
    lines.push('')
    lines.push(`   - Selected: ${q.selectedIndices && q.selectedIndices.length ? letters(q.selectedIndices) : '—'}`)
    lines.push(`   - Answer:   ${letters(q.correctIndices)}`)
    if (q.explanation) lines.push(`   - Explanation: ${q.explanation}`)
    lines.push('')
  })
  return lines.join('\n')
}

// ── HTML (self-contained; also used for PDF) ────────────────────
export function buildHtml(data: ExportData, css?: ExportCss): string {
  const body = data.questions.map((q, i) => {
    const st = statusOf(q)
    const color = !st.correct && q.selectedIndices && q.selectedIndices.length ? '#d9534f' : st.correct ? '#5cb85c' : '#f0ad4e'
    const opts = q.options.map((opt, j) => {
      const marker = q.selectedIndices?.includes(j) ? '▸' : ' '
      return `<div class="opt"><span class="label">${marker} ${ANSWER_LABELS[j]}.</span> ${renderRichText(opt)}</div>`
    }).join('')
    const expl = q.explanation ? `<div class="expl"><strong>Explanation:</strong> ${renderRichText(q.explanation)}</div>` : ''
    const selectedTxt = q.selectedIndices && q.selectedIndices.length ? ` · You selected: ${letters(q.selectedIndices)}` : ''
    return (
      `<div class="question">` +
      `<div class="q-head">Q${i + 1} <span class="status" style="color:${color}">${st.label}</span></div>` +
      `<div class="q-text">${renderRichText(q.question)}</div>` +
      opts +
      `<div class="ans">Answer: ${letters(q.correctIndices)}${selectedTxt}</div>` +
      expl +
      `</div>`
    )
  }).join('\n')

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(data.title)} — Results</title>
<style>
body { font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 720px; margin: 24px auto; padding: 0 16px; color: #222; }
h1 { font-size: 1.5em; }
.score { font-size: 1.15em; margin: 8px 0; }
.question { margin: 20px 0; padding: 12px; border: 1px solid #ddd; border-radius: 6px; }
.q-head { font-weight: 600; margin-bottom: 6px; }
.q-text { margin-bottom: 8px; }
.opt { margin: 2px 0; }
.label { font-weight: 600; }
.ans { margin-top: 8px; font-weight: 600; }
.expl { margin-top: 6px; color: #555; }
.status { font-weight: 700; }
</style>
<style>${css ? escapeCss(css.katexCss) : ''}</style>
<style>${css ? escapeCss(css.hljsCss) : ''}</style>
</head>
<body>
<h1>${escapeHtml(data.title)} — Results</h1>
<div class="score">Score: ${data.correct}/${data.total} (${percent(data)}%) &nbsp;·&nbsp; Time: ${formatTime(data.timeTakenSeconds)}</div>
${body}
</body>
</html>`
}

function escapeCss(s: string): string {
  return s.replace(/<\//g, '<\\/')
}
