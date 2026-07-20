import { useState, useEffect, useRef } from 'react'
import { useSettings } from '../SettingsContext'
import { parseMcqFile } from '../utils/mcqParser'
import { logQuizResult } from '../utils/quizLogger'
import { renderRichText, getRawContent, clearRawContentMap } from '../utils/renderRichText'
import { getDefaultMcqDir } from '../utils/settings'
import type { McqDocument, McqQuestion } from '../types'

type QuizState = 'list' | 'active' | 'results'

interface McqMeta {
  name: string
  title: string
  questionCount: number
  generated: string
}

export default function QuizView({ onActiveChange }: { onActiveChange?: (active: boolean) => void }) {
  const { settings } = useSettings()
  const [state, setState] = useState<QuizState>('list')
  const [files, setFiles] = useState<McqMeta[]>([])
  const [doc, setDoc] = useState<McqDocument | null>(null)
  const [currentIdx, setCurrentIdx] = useState(0)
  const [questions, setQuestions] = useState<McqQuestion[]>([])
  const [elapsed, setElapsed] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Load file list ───────────────────────────────────────────
  const loadFiles = async () => {
    const dir = settings.mcqOutputDir || await getDefaultMcqDir()
    const list = await window.electronAPI.readMcqMetadata(dir)
    setFiles(list)
  }

  useEffect(() => {
    loadFiles()
  }, [settings.mcqOutputDir])

  // ── Start quiz ───────────────────────────────────────────────
  const startQuiz = async (filename: string) => {
    const dir = settings.mcqOutputDir || await getDefaultMcqDir()
    const raw = await window.electronAPI.readFile(`${dir}/${filename}`)
    if (!raw) return

    const parsed = parseMcqFile(raw)
    if (!parsed) return

    setDoc(parsed)
    setQuestions(parsed.questions.map(q => ({ ...q, selectedIndex: undefined })))
    setCurrentIdx(0)
    setElapsed(0)
    setState('active')

    // Start timer
    timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000)
    await window.electronAPI.log(`Started quiz: ${parsed.title} (${parsed.questions.length} questions)`)
  }

  // ── Cleanup timer ────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  // ── Notify parent of active state ──────────────────────────
  useEffect(() => {
    onActiveChange?.(state === 'active')
  }, [state, onActiveChange])

  // ── Answer selection ─────────────────────────────────────────
  const selectAnswer = (optIdx: number) => {
    if (questions[currentIdx].selectedIndex !== undefined) return // already answered

    setQuestions(prev => {
      const next = [...prev]
      next[currentIdx] = { ...next[currentIdx], selectedIndex: optIdx }
      return next
    })
  }

  // ── Navigation ───────────────────────────────────────────────
  const goNext = () => {
    if (currentIdx < questions.length - 1) {
      setCurrentIdx(i => i + 1)
    }
  }

  const goPrev = () => {
    if (currentIdx > 0) {
      setCurrentIdx(i => i - 1)
    }
  }

  // ── Finish quiz ──────────────────────────────────────────────
  const finishQuiz = () => {
    if (timerRef.current) clearInterval(timerRef.current)

    // Log result
    const correct = questions.filter(q => q.selectedIndex === q.correctIndex).length
    logQuizResult({
      timestamp: new Date().toISOString(),
      title: doc?.title || 'Unknown',
      source: doc?.source || '',
      totalQuestions: questions.length,
      correctAnswers: correct,
      timeTakenSeconds: elapsed
    })

    setState('results')
  }

  // ── Keyboard shortcuts ───────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'q') {
        if (state === 'active' || state === 'results') {
          if (timerRef.current) clearInterval(timerRef.current)
          clearRawContentMap()
          setState('list')
        }
        return
      }

      if (state !== 'active') return
      const content = document.querySelector('.content') as HTMLElement | null
      if (!content) return
      if (e.key === 'n' || e.key === 'ArrowRight') goNext()
      else if (e.key === 'p' || e.key === 'ArrowLeft') goPrev()
      else if (e.key === 'a') selectAnswer(0)
      else if (e.key === 'b') selectAnswer(1)
      else if (e.key === 'c') selectAnswer(2)
      else if (e.key === 'd') selectAnswer(3)
      else if (e.key === 'j') content.scrollBy({ top: 40, behavior: 'smooth' })
      else if (e.key === 'k') content.scrollBy({ top: -40, behavior: 'smooth' })
      else if (e.key === 'h') content.scrollBy({ left: -40, behavior: 'smooth' })
      else if (e.key === 'l') content.scrollBy({ left: 40, behavior: 'smooth' })
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [state, currentIdx, questions])

  // ── Copy handler (copy-btn, inline-code, inline-math) ────────
  useEffect(() => {
    if (state !== 'active') return

    const handler = (e: MouseEvent) => {
      const el = e.target as HTMLElement
      const target = el.closest('[data-copy-id]') as HTMLElement | null
      if (!target) return
      const id = target.getAttribute('data-copy-id')!
      const raw = getRawContent(id)
      if (!raw) return
      navigator.clipboard.writeText(raw)

      if (target.classList.contains('copy-btn')) {
        const prev = target.textContent
        target.textContent = 'Copied!'
        setTimeout(() => { target.textContent = prev }, 1000)
        return
      }

      if (target.classList.contains('inline-code') || target.classList.contains('inline-math')) {
        target.classList.add('copied-flash')
        setTimeout(() => target.classList.remove('copied-flash'), 1000)
      }
    }

    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [state])

  // ── Render: file list ────────────────────────────────────────
  if (state === 'list') {
    return (
      <div className="panel">
        <h2>Take Quiz</h2>
        {files.length === 0 ? (
          <p>No .mcq files found. Generate one first.</p>
        ) : (
          <ul className="file-list">
            {files.map(f => (
              <li key={f.name} className="file-item" onClick={() => startQuiz(f.name)}>
                <div className="file-item-info">
                  <div className="file-item-title">{f.title}</div>
                  <div className="file-item-meta">
                    {f.name} · {f.questionCount} questions{f.generated ? ` · ${f.generated}` : ''}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  // ── Render: active quiz ──────────────────────────────────────
  if (state === 'active' && doc) {
    const q = questions[currentIdx]
    const answered = q.selectedIndex !== undefined
    const isCorrect = answered && q.selectedIndex === q.correctIndex
    const allAnswered = questions.every(q => q.selectedIndex !== undefined)
    const labels = ['A', 'B', 'C', 'D']

    return (
      <div className="quiz-container">
        <div className="quiz-header">
          <span className="quiz-progress">
            Question {currentIdx + 1} of {questions.length}
          </span>
          <span className="quiz-timer">{formatTime(elapsed)}</span>
        </div>

        <div className="quiz-question" dangerouslySetInnerHTML={{ __html: renderRichText(q.question) }} />

        <div className="quiz-options">
          {q.options.map((opt, i) => {
            let cls = 'option-card'
            if (answered && settings.instantFeedback) {
              if (i === q.correctIndex) cls += ' correct'
              else if (i === q.selectedIndex) cls += ' wrong'
            } else if (i === q.selectedIndex) {
              cls += ' selected'
            }
            return (
              <button key={i} className={cls} onClick={() => selectAnswer(i)}>
                <span className="label">{labels[i]}.</span>{' '}
                <span dangerouslySetInnerHTML={{ __html: renderRichText(opt) }} />
              </button>
            )
          })}
        </div>

        {answered && settings.instantFeedback && q.explanation && (
          <div className="preview" style={{ marginBottom: 16 }}>
            <strong>Explanation:</strong>{' '}
            <span dangerouslySetInnerHTML={{ __html: renderRichText(q.explanation) }} />
          </div>
        )}

        <div className="quiz-nav">
          <button className="secondary" onClick={() => {
            if (timerRef.current) clearInterval(timerRef.current)
            clearRawContentMap()
            setState('list')
          }}>
            ← Back
          </button>
          <button className="secondary" onClick={goPrev} disabled={currentIdx === 0}>
            Previous
          </button>
          {currentIdx === questions.length - 1 ? (
            <button disabled={!allAnswered} onClick={finishQuiz}>
              See Results
            </button>
          ) : (
            <button onClick={goNext}>Next</button>
          )}
        </div>
      </div>
    )
  }

  // ── Render: results ──────────────────────────────────────────
  if (state === 'results' && doc) {
    const correct = questions.filter(q => q.selectedIndex === q.correctIndex).length
    const total = questions.length
    const pct = Math.round((correct / total) * 100)
    const scoreClass = pct >= 80 ? 'good' : pct >= 50 ? 'ok' : 'bad'

    return (
      <div className="quiz-results">
        <h2>{doc.title} — Results</h2>
        <div className={`score-big ${scoreClass}`}>{pct}%</div>
        <div className="results-stats">
          <span>{correct}/{total} correct</span>
          <span>{formatTime(elapsed)} taken</span>
        </div>

        <div style={{ textAlign: 'left', marginTop: 24 }}>
          {questions.map((q, i) => {
            const labels = ['A', 'B', 'C', 'D']
            const correct = q.selectedIndex === q.correctIndex
            const skipped = q.selectedIndex === undefined
            return (
              <div key={i} className="preview-question" style={{ marginBottom: 12 }}>
                <p className="q-text" dangerouslySetInnerHTML={{ __html: `${i + 1}. ${renderRichText(q.question)}` }} />
                <p style={{ fontSize: 13, marginTop: 4 }}>
                  {skipped ? (
                    <span style={{ color: 'var(--warning)' }}>Skipped</span>
                  ) : correct ? (
                    <span style={{ color: 'var(--success)' }}>Correct ({labels[q.selectedIndex!]})</span>
                  ) : (
                    <span style={{ color: 'var(--error)' }}>
                      Wrong ({labels[q.selectedIndex!]}) — Answer: {labels[q.correctIndex]}
                    </span>
                  )}
                </p>
                {q.explanation && (
                  <div style={{ fontSize: 13, marginTop: 4, color: 'var(--muted)' }} dangerouslySetInnerHTML={{ __html: renderRichText(q.explanation) }} />
                )}
              </div>
            )
          })}
        </div>

        <div className="results-actions">
          <button onClick={() => { clearRawContentMap(); setState('list'); loadFiles() }}>Back to Quiz List</button>
        </div>
      </div>
    )
  }

  return null
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}
