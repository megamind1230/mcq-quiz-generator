import { useState, useEffect, useRef } from 'react'
import { useSettings } from '../SettingsContext'
import { parseMcqFile } from '../utils/mcqParser'
import { logQuizResult } from '../utils/quizLogger'
import { renderRichText, getRawContent, clearRawContentMap } from '../utils/renderRichText'
import { shuffle } from '../utils/shuffle'
import { buildExport, buildHtml, formatExtension, type ExportData, type ExportFormat } from '../utils/quizExporter'
import { getDefaultMcqDir } from '../utils/settings'
import { advanceLoop, BLOCK_SIZE, exactMatch, isAnswered, type QuizMode } from '../utils/quizModes'
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
  const [pendingDoc, setPendingDoc] = useState<McqDocument | null>(null)
  const [currentIdx, setCurrentIdx] = useState(0)
  const [questions, setQuestions] = useState<McqQuestion[]>([])
  const [loop, setLoop] = useState(false)
  const [pool, setPool] = useState<McqQuestion[]>([])
  const [mastered, setMastered] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [exportMsg, setExportMsg] = useState<string | null>(null)

  // ── Load file list ───────────────────────────────────────────
  const loadFiles = async () => {
    const dir = settings.mcqOutputDir || await getDefaultMcqDir()
    const list = await window.electronAPI.readMcqMetadata(dir)
    setFiles(list)
  }

  useEffect(() => {
    loadFiles()
  }, [settings.mcqOutputDir])

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

  // ── File click → parse → mode picker ─────────────────────────
  const handleFileClick = async (filename: string) => {
    const dir = settings.mcqOutputDir || await getDefaultMcqDir()
    const raw = await window.electronAPI.readFile(`${dir}/${filename}`)
    if (!raw) return

    const parsed = parseMcqFile(raw)
    if (!parsed) return

    setPendingDoc(parsed)
    await window.electronAPI.log(`Selected quiz: ${parsed.title} (${parsed.questions.length} questions)`)
  }

  const pickMode = async (mode: QuizMode) => {
    if (!pendingDoc) return
    const picked = pendingDoc
    setPendingDoc(null)
    await startQuiz(picked, mode)
  }

  // ── Start quiz ───────────────────────────────────────────────
  const startQuiz = async (parsed: McqDocument, mode: QuizMode) => {
    setDoc(parsed)

    let qs = parsed.questions.map(q => {
      if (settings.randomizeOptions) {
        const optionOrder = shuffle(q.options.map((_, i) => i))
        return {
          ...q,
          options: optionOrder.map(i => q.options[i]),
          correctIndices: q.correctIndices.map(idx => optionOrder.indexOf(idx))
        }
      }
      return { ...q }
    })
    if (settings.randomizeQuestionOrder) qs = shuffle(qs)

    setLoop(mode === 'loop')
    setMastered(false)
    const cleared = qs.map(q => ({ ...q, selectedIndices: undefined }))
    if (mode === 'loop') {
      setPool(cleared)
      setQuestions(cleared.slice(0, BLOCK_SIZE))
    } else {
      setPool([])
      setQuestions(cleared)
    }

    setCurrentIdx(0)
    setElapsed(0)
    setState('active')

    // Start timer
    timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000)
    await window.electronAPI.log(`Started quiz: ${parsed.title} (${parsed.questions.length} questions, ${mode} mode)`)
  }

  // ── Answer selection ─────────────────────────────────────────
  const selectAnswer = (optIdx: number) => {
    setQuestions(prev => {
      const next = [...prev]
      const cur = next[currentIdx]
      if (cur.multiAnswer) {
        const curSel = cur.selectedIndices || []
        const newSel = curSel.includes(optIdx)
          ? curSel.filter(i => i !== optIdx)
          : [...curSel, optIdx]
        next[currentIdx] = { ...cur, selectedIndices: newSel.length ? newSel : undefined }
      } else {
        const newSel = cur.selectedIndices?.[0] === optIdx ? undefined : [optIdx]
        next[currentIdx] = { ...cur, selectedIndices: newSel }
      }
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

  // ── Loop advance ─────────────────────────────────────────────
  const advanceLoopNow = async () => {
    if (!questions.every(isAnswered)) return
    const { done, pool: nextPool, batch } = advanceLoop(pool, questions)
    if (done) {
      if (timerRef.current) clearInterval(timerRef.current)
      clearRawContentMap()
      setMastered(true)
      setState('list')
      await window.electronAPI.log(`Completed loop: all questions mastered`)
      loadFiles()
    } else {
      setPool(nextPool)
      setQuestions(batch)
      setCurrentIdx(0)
    }
  }

  // ── Finish quiz ──────────────────────────────────────────────
  const finishQuiz = () => {
    if (timerRef.current) clearInterval(timerRef.current)

    // Log result
    const correct = questions.filter(q => exactMatch(q)).length
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

  // ── Export results ────────────────────────────────────────────
  const handleExport = async (format: ExportFormat) => {
    if (!doc) return
    setExportOpen(false)
    setExportMsg(null)

    const correct = questions.filter(q => exactMatch(q)).length
    const data: ExportData = {
      title: doc.title,
      correct,
      total: questions.length,
      timeTakenSeconds: elapsed,
      questions
    }

    const safeTitle = (doc.title || 'quiz').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'quiz'
    const defaultPath = `${safeTitle}-results.${formatExtension(format)}`
    const filters = [{ name: format.toUpperCase(), extensions: [formatExtension(format)] }]

    const outPath = await window.electronAPI.saveFile({ defaultPath, filters })
    if (!outPath) return

    try {
      if (format === 'pdf') {
        const assets = await window.electronAPI.exportAssets()
        const ok = await window.electronAPI.exportPdf(buildHtml(data, assets), outPath)
        if (!ok) { setExportMsg('Failed to export PDF'); return }
      } else {
        const css = (format === 'html') ? await window.electronAPI.exportAssets() : undefined
        await window.electronAPI.writeFile(outPath, buildExport(format, data, css))
      }
      setExportMsg(`Exported to ${outPath}`)
      await window.electronAPI.log(`Exported ${format} results to ${outPath}`)
    } catch (err) {
      setExportMsg('Export failed')
      await window.electronAPI.log(`Export error: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // ── Keyboard shortcuts ───────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'q') {
        if (pendingDoc) {
          setPendingDoc(null)
          return
        }
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
  }, [state, currentIdx, questions, pendingDoc])

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
        {mastered && <div className="mastered-msg">All questions mastered!</div>}
        {files.length === 0 ? (
          <p>No .mcq files found. Generate one first.</p>
        ) : (
          <ul className="file-list">
            {files.map(f => (
              <li key={f.name} className="file-item" onClick={() => handleFileClick(f.name)}>
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

        {pendingDoc && (
          <div className="overlay" onClick={() => setPendingDoc(null)}>
            <div className="mode-picker" onClick={e => e.stopPropagation()}>
              <h2>Choose a mode</h2>
              <button className="mode-btn" onClick={() => pickMode('loop')}>
                <strong>Loop Mode</strong>
                <span>Instant feedback on · retakes wrong answers until mastered · no results page</span>
              </button>
              <button className="mode-btn" onClick={() => pickMode('normal')}>
                <strong>Normal Mode</strong>
                <span>Feedback as set in settings · results page at the end</span>
              </button>
              <button className="mode-cancel" onClick={() => setPendingDoc(null)}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Render: active quiz ──────────────────────────────────────
  if (state === 'active' && doc) {
    const q = questions[currentIdx]
    const instant = settings.instantFeedback || loop
    const answered = isAnswered(q)
    const allAnswered = questions.every(isAnswered)
    const labels = ['A', 'B', 'C', 'D']
    const multi = q.multiAnswer
    const remaining = Math.max(0, pool.length - questions.length)

    return (
      <div className="quiz-container">
        <div className="quiz-header">
          <button className="leave-btn" onClick={() => {
            if (!confirm('Leave quiz? Your progress will be lost.')) return
            if (timerRef.current) clearInterval(timerRef.current)
            clearRawContentMap()
            setState('list')
          }}>
            ← Leave
          </button>
          <span className="quiz-progress">
            Question {currentIdx + 1} of {questions.length}
            {loop && ` · ${remaining} left`}
          </span>
          {multi ? (
            <span className="tag tag-multi">Select all that apply</span>
          ) : (
            <span className="tag tag-single">Single answer</span>
          )}
          {loop && <span className="tag tag-loop">Loop</span>}
          <span className="quiz-timer">{formatTime(elapsed)}</span>
        </div>

        <div className="quiz-question" dangerouslySetInnerHTML={{ __html: renderRichText(q.question) }} />
        {multi && <div className="quiz-hint">Choose one or more correct options.</div>}

        <div className="quiz-options">
          {q.options.map((opt, i) => {
            const isSelected = !!q.selectedIndices?.includes(i)
            let cls = multi ? 'option-card option-card-check' : 'option-card option-card-radio'
            if (answered && instant) {
              if (q.correctIndices.includes(i)) cls += ' correct'
              else if (isSelected) cls += ' wrong'
            } else if (isSelected) {
              cls += ' selected'
            }
            return (
              <button key={i} className={cls} onClick={() => selectAnswer(i)}>
                <span className="marker">{multi ? (isSelected ? '☑' : '☐') : (isSelected ? '●' : '○')}</span>
                <span className="label">{labels[i]}.</span>{' '}
                <span dangerouslySetInnerHTML={{ __html: renderRichText(opt) }} />
              </button>
            )
          })}
        </div>

        {answered && instant && q.explanation && (
          <div className="preview" style={{ marginBottom: 16 }}>
            <strong>Explanation:</strong>{' '}
            <span dangerouslySetInnerHTML={{ __html: renderRichText(q.explanation) }} />
          </div>
        )}

        <div className="quiz-nav">
          <button className="secondary" onClick={goPrev} disabled={currentIdx === 0}>
            Previous
          </button>
          {currentIdx === questions.length - 1 ? (
            loop ? (
              <button disabled={!allAnswered} onClick={advanceLoopNow}>
                Continue
              </button>
            ) : (
              <button disabled={!allAnswered} onClick={finishQuiz}>
                See Results
              </button>
            )
          ) : (
            <button onClick={goNext}>Next</button>
          )}
        </div>
      </div>
    )
  }

  // ── Render: results ──────────────────────────────────────────
  if (state === 'results' && doc) {
    const correct = questions.filter(q => exactMatch(q)).length
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
            const right = exactMatch(q)
            const selectedTxt = q.selectedIndices ? q.selectedIndices.map(i => labels[i]).join(', ') : ''
            const answerTxt = q.correctIndices.map(i => labels[i]).join(', ')
            const marker = right ? '✅' : '❌'
            const markerColor = right ? 'var(--success)' : 'var(--error)'
            return (
              <div key={i} className="preview-question" style={{ marginBottom: 12 }}>
                <p className="q-text" dangerouslySetInnerHTML={{ __html: `${i + 1}. ${renderRichText(q.question)}` }} />
                <p style={{ fontSize: 13, marginTop: 4 }}>
                  <strong>Your Answer(s) ==&gt;</strong> {selectedTxt}
                </p>
                <p style={{ fontSize: 13, marginTop: 2 }}>
                  <strong>Correct Answer(s) ==&gt;</strong> {answerTxt}{' '}
                  <span style={{ color: markerColor }}>{marker}</span>
                </p>
                {q.explanation && (
                  <div style={{ fontSize: 13, marginTop: 4, color: 'var(--muted)' }}>
                    <strong>Explanation:</strong>{' '}
                    <span dangerouslySetInnerHTML={{ __html: renderRichText(q.explanation) }} />
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className="results-actions">
          <div className="export-menu" style={{ position: 'relative', display: 'inline-block' }}>
            <button className="secondary" onClick={() => { setExportMsg(null); setExportOpen(o => !o) }}>
              Export ▾
            </button>
            {exportOpen && (
              <div className="export-dropdown" style={{ position: 'absolute', bottom: 44, left: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, zIndex: 10, minWidth: 140, overflow: 'hidden' }}>
                {(['pdf', 'html', 'org', 'md', 'txt'] as ExportFormat[]).map(f => (
                  <button
                    key={f}
                    className="export-item"
                    onClick={() => handleExport(f)}
                    style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', color: 'var(--text)', padding: '8px 12px', cursor: 'pointer', fontSize: 14 }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--accent)' }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
                  >
                    .{formatExtension(f)}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button onClick={() => { clearRawContentMap(); setState('list'); loadFiles() }}>Back to Quiz List</button>
        </div>
        {exportMsg && (
          <p style={{ fontSize: 13, marginTop: 8, color: exportMsg.includes('Failed') ? 'var(--error)' : 'var(--success)' }}>
            {exportMsg}
          </p>
        )}
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