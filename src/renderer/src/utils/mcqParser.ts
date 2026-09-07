import type { McqDocument, McqQuestion } from '../types'

/**
 * Parse a .mcq file into an McqDocument.
 * Format matches nextlearn's .mcq spec:
 *   YAML frontmatter (---...---)
 *   Question blocks separated by ---
 *   Each block: ## Question N, A/B/C/D options, **[Answer: X]**, **Explanation:**
 */
export function parseMcqFile(content: string): McqDocument | null {
  const lines = content.split('\n')

  // ── Parse YAML frontmatter ─────────────────────────────────
  let frontmatterEnd = -1
  if (lines[0]?.trim() === '---') {
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === '---') {
        frontmatterEnd = i
        break
      }
    }
  }

  let title = 'Untitled Quiz'
  let source = ''
  let generated = ''

  if (frontmatterEnd > 0) {
    const fm = lines.slice(1, frontmatterEnd).join('\n')
    title = extractYamlField(fm, 'title') || title
    source = extractYamlField(fm, 'source') || source
    generated = extractYamlField(fm, 'generated') || generated
  }

  // ── Parse question blocks ──────────────────────────────────
  const bodyStart = frontmatterEnd >= 0 ? frontmatterEnd + 1 : 0
  const body = lines.slice(bodyStart).join('\n')
  const blocks = body.split(/\n---\n/)

  const questions: McqQuestion[] = []

  for (const block of blocks) {
    const q = parseQuestionBlock(block)
    if (q) questions.push(q)
  }

  if (questions.length === 0) return null

  return { title, source, generated, questions }
}

function parseQuestionBlock(block: string): McqQuestion | null {
  const lines = block.split('\n')

  // Find question heading
  let questionLines: string[] = []
  let questionStart = -1
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^##\s+Question\s+\d+/i)
    if (m) {
      questionStart = i + 1
      break
    }
  }
  if (questionStart < 0) return null

  // Collect question text (until first option A.)
  const options: string[] = []
  let currentOption = -1
  let answerLine = ''
  let explanationLines: string[] = []
  let inExplanation = false

  for (let i = questionStart; i < lines.length; i++) {
    const line = lines[i]

    // Option line: A. / B. / C. / D.
    const optMatch = line.match(/^([A-D])\.\s+(.*)/)
    if (optMatch) {
      currentOption++
      options.push(optMatch[2])
      continue
    }

    // Answer line: **[Answer: A]** or **[Answer:A,C]**
    const ansMatch = line.match(/^\*\*\[Answer:\s*([A-D](?:\s*,\s*[A-D])*)\s*\]\*\*/i)
    if (ansMatch) {
      answerLine = ansMatch[1].trim()
      inExplanation = false
      continue
    }

    // Explanation line
    const explMatch = line.match(/^\*\*Explanation:\*\*\s*(.*)/)
    if (explMatch) {
      explanationLines.push(explMatch[1])
      inExplanation = true
      continue
    }

    // Accumulate
    if (inExplanation) {
      explanationLines.push(line)
    } else if (currentOption >= 0 && options.length <= currentOption) {
      // Multi-line option content
      options[currentOption] += '\n' + line
    } else if (questionLines.length > 0 || line.trim()) {
      // Question text
      questionLines.push(line)
    }
  }

  const question = questionLines.join('\n').trim()
  if (!question || options.length < 4 || !answerLine) return null

  const correctIndices = parseAnswerList(answerLine).filter(i => i >= 0 && i < options.length)
  if (correctIndices.length === 0) return null
  const explanation = explanationLines.join('\n').trim() || undefined

  return {
    question,
    options: options.map(o => o.trim()),
    correctIndices,
    multiAnswer: correctIndices.length > 1,
    explanation
  }
}

/** Parse an answer string like "B" or "A,C" into option indices. */
export function parseAnswerList(answer: string): number[] {
  return answer
    .split(',')
    .map(s => s.trim().toUpperCase())
    .filter(Boolean)
    .filter(s => /^[A-D]$/.test(s))
    .map(s => s.charCodeAt(0) - 65)
}

function extractYamlField(fm: string, field: string): string {
  // Handles: key: value, key: "value with: colons", key: 'value'
  const re = new RegExp(`^${field}:\\s*(?:"([^"]*)"|'([^']*)'|(.+))\\s*$`, 'm')
  const m = fm.match(re)
  return m ? (m[1] ?? m[2] ?? m[3] ?? '').trim() : ''
}
