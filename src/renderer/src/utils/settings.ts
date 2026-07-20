import type { AppSettings } from '../types'

let configDir = ''

export const DEFAULTS: AppSettings = {
  geminiApiKey: '',
  mcqOutputDir: '',
  theme: 'dark',
  instantFeedback: false,
  fileManager: 'xdg-open'
}

export async function getConfigDir(): Promise<string> {
  if (!configDir) {
    const paths = await window.electronAPI.getPaths()
    configDir = paths.configDir
  }
  return configDir
}

export async function getDefaultMcqDir(): Promise<string> {
  const paths = await window.electronAPI.getPaths()
  return paths.mcqOutputDir
}

export async function loadSettings(): Promise<AppSettings> {
  try {
    const dir = await getConfigDir()
    const raw = await window.electronAPI.readFile(`${dir}/settings.json`)
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch { /* ignore */ }
  return DEFAULTS
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  const dir = await getConfigDir()
  await window.electronAPI.ensureDir(dir)
  const json = JSON.stringify(settings, null, 2)
  await window.electronAPI.writeFile(`${dir}/settings.json`, json)
}
