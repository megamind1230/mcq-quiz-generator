import { useState, useEffect, useCallback } from 'react'
import { SettingsProvider, useSettings } from './SettingsContext'
import GeneratePanel from './components/GeneratePanel'
import QuizView from './components/QuizView'
import QuizLogs from './components/QuizLogs'
import Settings from './components/Settings'
import 'katex/dist/katex.min.css'
import 'highlight.js/styles/github-dark.css'

type Tab = 'generate' | 'quiz' | 'logs' | 'settings'

const TABS: { id: Tab; label: string }[] = [
  { id: 'generate', label: 'Generate' },
  { id: 'quiz', label: 'Quiz' },
  { id: 'logs', label: 'Logs' },
  { id: 'settings', label: 'Settings' }
]

function AppInner() {
  const { settings } = useSettings()
  const [activeTab, setActiveTab] = useState<Tab>('generate')
  const [quizActive, setQuizActive] = useState(false)

  const handleTabChange = useCallback((tab: Tab) => {
    if (tab !== 'quiz' && quizActive) {
      if (!confirm('Quiz in progress. Leave and lose progress?')) return
    }
    setActiveTab(tab)
  }, [quizActive])

  // Apply theme class to root
  useEffect(() => {
    const root = document.documentElement
    root.classList.remove('dark', 'light')
    root.classList.add(settings.theme)
  }, [settings.theme])

  return (
    <div className="app">
      <nav className="tabs">
        {TABS.map(tab => (
          <button
            key={tab.id}
            className={`tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => handleTabChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>
      <main className="content">
        {activeTab === 'generate' && <GeneratePanel />}
        {activeTab === 'quiz' && <QuizView onActiveChange={setQuizActive} />}
        {activeTab === 'logs' && <QuizLogs />}
        {activeTab === 'settings' && <Settings />}
      </main>
    </div>
  )
}

export default function App() {
  return (
    <SettingsProvider>
      <AppInner />
    </SettingsProvider>
  )
}
