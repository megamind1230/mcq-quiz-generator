declare global {
  interface Window {
    electronAPI: {
      openFile: (filters?: { name: string; extensions: string[] }[]) => Promise<string | null>
      openDirectory: () => Promise<string | null>
      readFile: (filePath: string) => Promise<string | null>
      writeFile: (filePath: string, content: string) => Promise<boolean>
      listFiles: (dirPath: string, ext?: string) => Promise<string[]>
      readMcqMetadata: (dirPath: string) => Promise<{ name: string; title: string; questionCount: number; generated: string }[]>
      ensureDir: (dirPath: string) => Promise<boolean>
      log: (msg: string) => Promise<void>
      openExternal: (url: string) => Promise<void>
      openPath: (path: string, fileManager: string) => Promise<boolean>
      getPaths: () => Promise<{ configDir: string; mcqOutputDir: string; logDir: string }>
    }
  }
}

export interface McqQuestion {
  question: string
  options: string[]
  correctIndex: number
  explanation?: string
  selectedIndex?: number // transient, during quiz
}

export interface McqDocument {
  title: string
  source: string
  generated: string
  questions: McqQuestion[]
}

export interface QuizResult {
  timestamp: string
  title: string
  source: string
  totalQuestions: number
  correctAnswers: number
  timeTakenSeconds: number
}

export interface AppSettings {
  geminiApiKey: string
  mcqOutputDir: string
  theme: 'light' | 'dark'
  instantFeedback: boolean
  fileManager: string
}
