import { useState } from 'react'
import { useSettings } from '../SettingsContext'
import { buildPrompt } from '../utils/mcqGenerator'

export default function Settings() {
  const { draft, setDraft, save, reset, dirty } = useSettings()
  const [copied, setCopied] = useState(false)
  const [fmError, setFmError] = useState(false)

  const handlePickDir = async () => {
    const dir = await window.electronAPI.openDirectory()
    if (dir) setDraft({ mcqOutputDir: dir })
  }

  const handleCopyPrompt = async () => {
    const prompt = buildPrompt('{your content here}', 10)
    await navigator.clipboard.writeText(prompt)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleOpenDir = async () => {
    const ok = await window.electronAPI.openPath(draft.mcqOutputDir, draft.fileManager)
    if (!ok) {
      setFmError(true)
      setTimeout(() => setFmError(false), 3000)
    }
  }

  return (
    <div className="panel">
      <h2>Settings</h2>

      <div className="setting">
        <label>
          Gemini API Key{' '}
          <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>
            — get one free at{' '}
            <a href="#" onClick={(e) => { e.preventDefault(); window.electronAPI.openExternal('https://aistudio.google.com/apikey') }}>
              Google AI Studio
            </a>
          </span>
        </label>
        <input
          type="password"
          value={draft.geminiApiKey}
          onChange={e => setDraft({ geminiApiKey: e.target.value })}
          placeholder="Paste your Gemini API key"
        />
      </div>

      <hr />

      <div className="setting">
        <label>File Manager</label>
        <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: '0 0 8px' }}>
          Required to use the [Open] button below.
        </p>
        <select
          value={draft.fileManager}
          onChange={e => setDraft({ fileManager: e.target.value })}
        >
          <option value="xdg-open">xdg-open (default)</option>
          <option value="bees">Bees</option>
          <option value="caja">Caja (MATE)</option>
          <option value="crosaider">Crosaider</option>
          <option value="dolphin">Dolphin (KDE)</option>
          <option value="doublecmd">Double Commander</option>
          <option value="fm">fm</option>
          <option value="gentoo">Gentoo</option>
          <option value="konqueror">Konqueror</option>
          <option value="lf">lf</option>
          <option value="midnight-commander">Midnight Commander (mc)</option>
          <option value="nautilus">Nautilus (GNOME)</option>
          <option value="nemo">Nemo (Cinnamon)</option>
          <option value="nnn">nnn</option>
          <option value="organize">Organize</option>
          <option value="pantheon-files">Pantheon Files (elementary)</option>
          <option value="pcmanfm">PCManFM (LXDE)</option>
          <option value="pcmanfm-qt">PCManFM-Qt (LXQt)</option>
          <option value="qtfm">QtFM</option>
          <option value="ranger">Ranger</option>
          <option value="rox">ROX Filer</option>
          <option value="spacefm">SpaceFM</option>
          <option value="sunflower">Sunflower</option>
          <option value="thunar">Thunar (XFCE)</option>
          <option value="vifm">vifm</option>
          <option value="worker">Worker</option>
          <option value="yazi">Yazi</option>
        </select>
      </div>

      <hr />

      <div className="setting">
        <label>MCQ Output Directory</label>
        <div className="row">
          <input
            type="text"
            value={draft.mcqOutputDir}
            onChange={e => setDraft({ mcqOutputDir: e.target.value })}
            placeholder="~/magnus/mcq-quiz-generator/mcqs"
          />
          <button onClick={handlePickDir}>Browse</button>
          <button className="secondary" onClick={handleOpenDir}>Open</button>
        </div>
        {fmError && <p style={{ fontSize: 13, color: 'var(--error)', marginTop: 6 }}>File manager not found. Check your selection in settings.</p>}
      </div>

      <hr />

      <div className="setting">
        <label>Theme</label>
        <div className="row">
          <button
            className={draft.theme === 'dark' ? '' : 'secondary'}
            onClick={() => setDraft({ theme: 'dark' })}
          >
            Dark
          </button>
          <button
            className={draft.theme === 'light' ? '' : 'secondary'}
            onClick={() => setDraft({ theme: 'light' })}
          >
            Light
          </button>
        </div>
      </div>

      <hr />

      <div className="setting" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <label style={{ margin: 0 }}>Instant Answer Feedback on click</label>
        <input
          type="checkbox"
          checked={draft.instantFeedback}
          onChange={e => setDraft({ instantFeedback: e.target.checked })}
        />
      </div>

      <hr />

      <div className="setting">
        <label>AI Prompt Template</label>
        <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: '0 0 8px' }}>
          Copy the prompt template to paste into any AI agent.
        </p>
        <button className="secondary" onClick={handleCopyPrompt}>
          {copied ? 'Copied!' : 'Copy Prompt to Clipboard'}
        </button>
      </div>

      <div className="controls" style={{ marginTop: 16 }}>
        <button disabled={!dirty} onClick={save}>Save Settings</button>
        <button className="secondary" onClick={reset}>Reset to Defaults</button>
      </div>
      {dirty && <p style={{ fontSize: 13, color: 'var(--warning)', marginTop: 8 }}>Unsaved changes</p>}
    </div>
  )
}
