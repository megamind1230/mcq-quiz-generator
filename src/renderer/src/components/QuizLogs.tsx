import { useState, useEffect } from 'react'
import { loadQuizResults } from '../utils/quizLogger'
import { formatTime } from '../utils/format'
import type { QuizResult } from '../types'

export default function QuizLogs() {
  const [results, setResults] = useState<QuizResult[]>([])

  useEffect(() => {
    setResults(loadQuizResults())
  }, [])

  if (results.length === 0) {
    return (
      <div className="panel">
        <h2>Quiz Logs</h2>
        <p>No quiz history yet. Take a quiz to see results here.</p>
      </div>
    )
  }

  const orgText = buildOrgTable(results)

  return (
    <div className="panel">
      <h2>Quiz Logs</h2>
      <div className="org-table">{orgText}</div>
    </div>
  )
}

function buildOrgTable(results: QuizResult[]): string {
  const cols = '| Date | Title | Score | Questions | Time |\n'
  const sep    = '|----------+----------------+-------+-----------+------|\n'
  const rows = results.map(r => {
    const pct = Math.round((r.correctAnswers / r.totalQuestions) * 100)
    const date = new Date(r.timestamp).toISOString().slice(0, 16).replace('T', ' ')
    const time = formatTime(r.timeTakenSeconds)
    return `| ${date} | ${r.title} | ${pct}% | ${r.correctAnswers}/${r.totalQuestions} | ${time} |`
  }).join('\n')

  return cols + sep + rows
}
