declare global {
  interface Window {
    electronAPI: {
      openFile: (filters?: { name: string; extensions: string[] }[], defaultPath?: string) => Promise<string | null>
      openDirectory: () => Promise<string | null>
      saveFile: (opts?: { defaultPath?: string; filters?: { name: string; extensions: string[] }[] }) => Promise<string | null>
      exportPdf: (html: string, outPath: string) => Promise<boolean>
      exportAssets: () => Promise<{ katexCss: string; hljsCss: string }>
      readFile: (filePath: string) => Promise<string | null>
      writeFile: (filePath: string, content: string) => Promise<boolean>
      listFiles: (dirPath: string, ext?: string) => Promise<string[]>
      readMcqMetadata: (dirPath: string) => Promise<{ name: string; title: string; questionCount: number; generated: string }[]>
      ensureDir: (dirPath: string) => Promise<boolean>
      encryptMcq: (content: string) => Promise<string>
      decryptMcq: (content: string) => Promise<string | null>
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
  correctIndices: number[]
  multiAnswer: boolean
  explanation?: string
  selectedIndices?: number[] // transient, during quiz
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
  randomizeOptions: boolean
  randomizeQuestionOrder: boolean
  encryptOutput: boolean
  fileManager: string
}
