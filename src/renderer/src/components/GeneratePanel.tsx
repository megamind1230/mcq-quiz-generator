import { useState } from 'react'
import { useSettings } from '../SettingsContext'
import { extractContent } from '../utils/inputParser'
import { generateMcqs } from '../utils/mcqGenerator'
import { serializeMcq } from '../utils/mcqWriter'
import { getDefaultMcqDir } from '../utils/settings'
import type { McqDocument } from '../types'

export default function GeneratePanel() {
  const { settings } = useSettings()
  const [filePath, setFilePath] = useState<string | null>(null)
  const [content, setContent] = useState<string>('')
  const [questionCount, setQuestionCount] = useState(10)
  const [generating, setGenerating] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [preview, setPreview] = useState<McqDocument | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleOpenFile = async () => {
    const path = await window.electronAPI.openFile()
    if (!path) return
    setFilePath(path)
    setPreview(null)
    setError(null)
    setStatus('Reading file...')

    const raw = await window.electronAPI.readFile(path)
    if (!raw) {
      setError('Failed to read file')
      setStatus(null)
      return
    }

    const ext = '.' + path.split('.').pop()
    const extracted = extractContent(raw, ext)
    setContent(extracted)
    setStatus(`Loaded ${extracted.length.toLocaleString()} characters`)
    await window.electronAPI.log(`Opened file: ${path} (${extracted.length} chars)`)
  }

  const handleGenerate = async () => {
    if (!content || !settings.geminiApiKey) return
    setGenerating(true)
    setError(null)
    setStatus('Starting generation...')

    try {
      const sourceName = filePath?.split('/').pop() || 'input.txt'
      const doc = await generateMcqs(content, questionCount, settings.geminiApiKey, sourceName, (msg) => {
        setStatus(msg)
      })
      setPreview(doc)
      setStatus(`Generated ${doc.questions.length} questions`)
      await window.electronAPI.log(`Generated ${doc.questions.length} questions from ${sourceName}`)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      setStatus(null)
      await window.electronAPI.log(`Generation error: ${msg}`)
    } finally {
      setGenerating(false)
    }
  }

  const handleSave = async () => {
    if (!preview) return

    const dir = settings.mcqOutputDir || await getDefaultMcqDir()
    await window.electronAPI.ensureDir(dir)

    const sourceName = preview.source || 'quiz'
    const filename = `${sourceName}.mcq`
    const fullPath = `${dir}/${filename}`

    const fileContent = serializeMcq(preview)
    const ok = await window.electronAPI.writeFile(fullPath, fileContent)

    if (ok) {
      setStatus(`Saved to ${fullPath}`)
      await window.electronAPI.log(`Saved MCQ to ${fullPath}`)
      setPreview(null)
      setFilePath(null)
      setContent('')
    } else {
      setError('Failed to save file')
    }
  }

  return (
    <div className="panel">
      <h2>Generate MCQ Quiz</h2>

      <button onClick={handleOpenFile} disabled={generating}>Open Text File (.txt / .md / .org)</button>
      {filePath && <p className="file-path">{filePath}</p>}

      {content && !generating && (
        <div className="preview">
          <p>Content loaded ({content.length.toLocaleString()} chars)</p>
        </div>
      )}

      {!settings.geminiApiKey && (
        <div className="notice">
          Set your Gemini API key in Settings to enable AI generation.
        </div>
      )}

      {status && (
        <div className="status-bar">{status}</div>
      )}

      <div className="controls">
        <label>
          Questions:
          <input
            type="number"
            min={1}
            max={50}
            value={questionCount}
            onChange={e => setQuestionCount(Math.min(50, Math.max(1, Number(e.target.value) || 1)))}
            disabled={generating}
          />
        </label>
        <button
          disabled={!content || !settings.geminiApiKey || generating}
          onClick={handleGenerate}
        >
          {generating ? 'Generating...' : 'Generate MCQs'}
        </button>
      </div>

      {error && <div className="error">{error}</div>}

      {preview && (
        <div className="preview-card">
          <h3>Preview: {preview.title}</h3>
          <p>{preview.questions.length} questions generated</p>
          <div className="preview-questions">
            {preview.questions.slice(0, 3).map((q, i) => (
              <div key={i} className="preview-question">
                <p className="q-text">{i + 1}. {q.question.slice(0, 100)}...</p>
                <p className="q-answer">Answer: {String.fromCharCode(65 + q.correctIndex)}</p>
              </div>
            ))}
            {preview.questions.length > 3 && (
              <p className="more">...and {preview.questions.length - 3} more</p>
            )}
          </div>
          <div className="controls">
            <button onClick={handleSave}>Save .mcq File</button>
            <button className="secondary" onClick={() => { setPreview(null); setStatus(null) }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}
