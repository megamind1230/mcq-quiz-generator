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
  const [encResult, setEncResult] = useState<string | null>(null)
  const [multiAnswer, setMultiAnswer] = useState(false)
  const [bulkRunning, setBulkRunning] = useState(false)
  const [bulkResult, setBulkResult] = useState<string | null>(null)

  const LAST_DIR_KEY = 'mcq-last-open-dir'
  const getLastDir = () => localStorage.getItem(LAST_DIR_KEY)
  const saveLastDir = (filePath: string) => {
    const dir = filePath.replace(/\/[^/]+$/, '')
    localStorage.setItem(LAST_DIR_KEY, dir)
  }

  const handleOpenFile = async () => {
    const path = await window.electronAPI.openFile(undefined, getLastDir() || undefined)
    if (!path) return
    saveLastDir(path)
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
      }, multiAnswer)
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
    const plain = serializeMcq(preview)

    const plainOk = await window.electronAPI.writeFile(`${dir}/${sourceName}.mcq`, plain)

    let encryptedOk = true
    if (settings.encryptOutput) {
      const encrypted = await window.electronAPI.encryptMcq(plain)
      encryptedOk = await window.electronAPI.writeFile(`${dir}/${sourceName}.emcq`, encrypted)
    }

    if (plainOk && encryptedOk) {
      setStatus(settings.encryptOutput
        ? `Saved ${sourceName}.mcq and ${sourceName}.emcq to ${dir}`
        : `Saved to ${dir}/${sourceName}.mcq`)
      await window.electronAPI.log(`Saved MCQ to ${dir} (encrypted: ${settings.encryptOutput})`)
      setPreview(null)
      setFilePath(null)
      setContent('')
    } else {
      setError('Failed to save file')
    }
  }

  const handleEncryptExisting = async () => {
    const path = await window.electronAPI.openFile([
      { name: 'MCQ Files', extensions: ['mcq', 'emcq'] }
    ], getLastDir() || undefined)
    if (!path) return
    saveLastDir(path)
    setEncResult(null)

    const raw = await window.electronAPI.readFile(path)
    if (!raw) {
      setEncResult('Failed to read file')
      return
    }

    const isEmcq = path.toLowerCase().endsWith('.emcq')
    const dir = path.replace(/\/[^/]+$/, '')
    const base = path.split('/').pop()!.replace(/\.(mcq|emcq)$/i, '')
    const outPath = `${dir}/${base}.emcq`

    const encrypted = await window.electronAPI.encryptMcq(raw)
    const ok = await window.electronAPI.writeFile(outPath, encrypted)

    setEncResult(ok
      ? `${isEmcq ? 'Re-encrypted' : 'Encrypted'}: ${outPath}`
      : 'Failed to write encrypted file')
    if (ok) await window.electronAPI.log(`Encrypted ${path} -> ${outPath}`)
  }

  const handleBulkEncrypt = async () => {
    const dir = settings.mcqOutputDir || await getDefaultMcqDir()
    const mcqFiles = await window.electronAPI.listFiles(dir, '.mcq')
    const emcqFiles = await window.electronAPI.listFiles(dir, '.emcq')

    const emcqBases = new Set(emcqFiles.map(f => f.replace(/\.emcq$/i, '')))
    const toEncrypt = mcqFiles.filter(f => !emcqBases.has(f.replace(/\.mcq$/, '')))

    if (toEncrypt.length === 0) {
      setBulkResult('No .mcq files need encrypting (all already have .emcq).')
      return
    }

    setBulkRunning(true)
    setBulkResult(null)
    let encrypted = 0
    let failed = 0

    for (let i = 0; i < toEncrypt.length; i++) {
      setBulkResult(`Encrypting ${i + 1} of ${toEncrypt.length}...`)
      const mcqName = toEncrypt[i]
      const base = mcqName.replace(/\.mcq$/, '')
      const raw = await window.electronAPI.readFile(`${dir}/${mcqName}`)
      if (!raw) { failed++; continue }

      const emcqContent = await window.electronAPI.encryptMcq(raw)
      const ok = await window.electronAPI.writeFile(`${dir}/${base}.emcq`, emcqContent)
      if (ok) encrypted++
      else failed++
    }

    setBulkRunning(false)
    const parts = []
    if (encrypted > 0) parts.push(`Encrypted ${encrypted} file${encrypted !== 1 ? 's' : ''}`)
    if (failed > 0) parts.push(`${failed} failed`)
    setBulkResult(parts.join(', '))
    await window.electronAPI.log(`Bulk encrypt: ${encrypted} encrypted, ${failed} failed in ${dir}`)
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
          type="button"
          disabled={generating}
          className={!multiAnswer ? '' : 'secondary'}
          onClick={() => setMultiAnswer(false)}
        >
          Single-answer
        </button>
        <button
          type="button"
          disabled={generating}
          className={multiAnswer ? '' : 'secondary'}
          onClick={() => setMultiAnswer(true)}
        >
          Multi-answer
        </button>
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
                <p className="q-answer">Answer: {q.correctIndices.map(j => String.fromCharCode(65 + j)).join(', ')}</p>
              </div>
            ))}
            {preview.questions.length > 3 && (
              <p className="more">...and {preview.questions.length - 3} more</p>
            )}
          </div>
          <div className="controls">
            <button onClick={handleSave}>Save .mcq{settings.encryptOutput ? ' + .emcq' : ''} File</button>
            <button className="secondary" onClick={() => { setPreview(null); setStatus(null) }}>Cancel</button>
          </div>
        </div>
      )}

      <hr style={{ margin: '24px 0' }} />

      <div className="preview-card">
        <h3>Encrypt an Existing .mcq</h3>
        <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: '0 0 8px' }}>
          Creates an encrypted .emcq beside your file so students can't read answers in an editor.
        </p>
        <button onClick={handleEncryptExisting}>Choose .mcq File → Encrypt</button>
        {encResult && (
          <p style={{ fontSize: 13, marginTop: 8, color: encResult.startsWith('Failed') ? 'var(--error)' : 'var(--success)' }}>
            {encResult}
          </p>
        )}
      </div>

      <hr style={{ margin: '24px 0' }} />

      <div className="preview-card">
        <h3>Bulk Encrypt .mcq → .emcq</h3>
        <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: '0 0 8px' }}>
          Encrypts all .mcq files in the output directory that don't already have a matching .emcq.
        </p>
        <button disabled={bulkRunning} onClick={handleBulkEncrypt}>
          {bulkRunning ? 'Encrypting...' : 'Bulk Encrypt All'}
        </button>
        {bulkResult && (
          <p style={{ fontSize: 13, marginTop: 8, color: bulkResult.startsWith('No ') ? 'var(--text-dim)' : 'var(--success)' }}>
            {bulkResult}
          </p>
        )}
      </div>
    </div>
  )
}
