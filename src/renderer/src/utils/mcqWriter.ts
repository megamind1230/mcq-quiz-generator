import type { McqDocument } from '../types'

/**
 * Serialize an McqDocument back to .mcq file format.
 * Matches nextlearn's .mcq spec.
 */
export function serializeMcq(doc: McqDocument): string {
  const lines: string[] = []

  // ── YAML frontmatter ───────────────────────────────────────
  lines.push('---')
  lines.push(`title: ${doc.title}`)
  if (doc.source) lines.push(`source: ${doc.source}`)
  if (doc.generated) lines.push(`generated: ${doc.generated}`)
  lines.push('---')
  lines.push('')

  // ── Question blocks ────────────────────────────────────────
  doc.questions.forEach((q, i) => {
    lines.push(`## Question ${i + 1}`)
    lines.push(q.question)
    lines.push('')
    const labels = ['A', 'B', 'C', 'D']
    q.options.forEach((opt, j) => {
      lines.push(`${labels[j]}. ${opt}`)
    })
    lines.push('')
    const answerLetters = q.correctIndices.map(idx => labels[idx]).join(',')
    const answer = q.multiAnswer ? `**[Answer:${answerLetters}]**` : `**[Answer: ${answerLetters}]**`
    lines.push(answer)
    if (q.explanation) {
      lines.push(`**Explanation:** ${q.explanation}`)
    }
    lines.push('')
    lines.push('---')
    lines.push('')
  })

  return lines.join('\n')
}
