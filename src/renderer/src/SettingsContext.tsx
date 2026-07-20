import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import { loadSettings, saveSettings, DEFAULTS } from './utils/settings'
import type { AppSettings } from './types'

interface SettingsCtx {
  settings: AppSettings
  draft: AppSettings
  setDraft: (patch: Partial<AppSettings>) => void
  save: () => void
  reset: () => void
  dirty: boolean
}

const Ctx = createContext<SettingsCtx>({
  settings: DEFAULTS,
  draft: DEFAULTS,
  setDraft: () => {},
  save: () => {},
  reset: () => {},
  dirty: false
})

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULTS)
  const [draft, setDraftState] = useState<AppSettings>(DEFAULTS)

  useEffect(() => {
    loadSettings().then(s => {
      setSettings(s)
      setDraftState(s)
    }).catch(() => {})
  }, [])

  const setDraft = useCallback((patch: Partial<AppSettings>) => {
    setDraftState(prev => ({ ...prev, ...patch }))
  }, [])

  const save = useCallback(() => {
    saveSettings(draft)
    setSettings(draft)
  }, [draft])

  const reset = useCallback(() => {
    setDraftState(DEFAULTS)
  }, [])

  const dirty = JSON.stringify(draft) !== JSON.stringify(settings)

  return (
    <Ctx.Provider value={{ settings, draft, setDraft, save, reset, dirty }}>
      {children}
    </Ctx.Provider>
  )
}

export function useSettings() {
  return useContext(Ctx)
}
