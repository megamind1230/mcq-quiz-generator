import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { homedir, tmpdir } from 'os'
import { readFile, writeFile, readdir, mkdir, rm } from 'fs/promises'
import { existsSync } from 'fs'
import { execFile, spawn } from 'child_process'
import { decryptMcq, encryptMcq } from './crypto'
import { getExportAssets } from './exportAssets'

let mainWindow: BrowserWindow | null = null

const LOG_DIR = join(process.env.HOME || '~', 'magnus', 'mcq-quiz-generator', 'logs')

async function ensureLogDir(): Promise<void> {
  if (!existsSync(LOG_DIR)) {
    await mkdir(LOG_DIR, { recursive: true })
  }
}

async function log(msg: string): Promise<void> {
  await ensureLogDir()
  const ts = new Date().toISOString()
  const line = `[${ts}] ${msg}\n`
  const logFile = join(LOG_DIR, `${new Date().toISOString().slice(0, 10)}.log`)
  await writeFile(logFile, line, { flag: 'a' })
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    title: 'MCQ Quiz Generator',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  log('Window created')
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ── IPC Handlers ──────────────────────────────────────────────

ipcMain.handle('dialog:openFile', async (_event, filters?: { name: string; extensions: string[] }[], defaultPath?: string) => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    defaultPath,
    filters: filters || [
      { name: 'Text Files', extensions: ['txt', 'md', 'org'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
})

ipcMain.handle('dialog:openDirectory', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory']
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
})

ipcMain.handle('dialog:saveFile', async (_event, opts: { defaultPath?: string; filters?: { name: string; extensions: string[] }[] }) => {
  const result = await dialog.showSaveDialog({
    defaultPath: opts?.defaultPath,
    filters: opts?.filters
  })
  if (result.canceled || !result.filePath) return null
  return result.filePath
})

ipcMain.handle('file:read', async (_event, filePath: string) => {
  try {
    const content = await readFile(filePath, 'utf-8')
    return decryptMcq(content)
  } catch (err) {
    await log(`Error reading ${filePath}: ${err}`)
    return null
  }
})

ipcMain.handle('file:write', async (_event, filePath: string, content: string) => {
  try {
    const dir = join(filePath, '..')
    if (!existsSync(dir)) await mkdir(dir, { recursive: true })
    await writeFile(filePath, content, 'utf-8')
    return true
  } catch (err) {
    await log(`Error writing ${filePath}: ${err}`)
    return false
  }
})

ipcMain.handle('file:list', async (_event, dirPath: string, ext?: string) => {
  try {
    const files = await readdir(dirPath, { withFileTypes: true })
    return files
      .filter(f => f.isFile())
      .filter(f => !ext || f.name.endsWith(ext))
      .map(f => f.name)
  } catch (err) {
    await log(`Error listing ${dirPath}: ${err}`)
    return []
  }
})

ipcMain.handle('file:mcqMetadata', async (_event, dirPath: string) => {
  try {
    const files = await readdir(dirPath, { withFileTypes: true })
    const mcqFiles = files.filter(f => f.isFile() && (f.name.endsWith('.mcq') || f.name.endsWith('.emcq')))
    const results: { name: string; title: string; questionCount: number; generated: string }[] = []
    for (const f of mcqFiles) {
      try {
        const content = decryptMcq(await readFile(join(dirPath, f.name), 'utf-8')) || ''
        const frontmatter = content.split('---')[1] || ''
        const title = frontmatter.match(/^title:\s*(.+)$/m)?.[1] || f.name
        const generated = frontmatter.match(/^generated:\s*(.+)$/m)?.[1] || ''
        const questionCount = (content.match(/^## Question /gm) || []).length
        results.push({ name: f.name, title, questionCount, generated })
      } catch {
        results.push({ name: f.name, title: f.name, questionCount: 0, generated: '' })
      }
    }
    return results
  } catch (err) {
    await log(`Error reading mcq metadata: ${err}`)
    return []
  }
})

ipcMain.handle('dir:ensure', async (_event, dirPath: string) => {
  if (!existsSync(dirPath)) {
    await mkdir(dirPath, { recursive: true })
  }
  return true
})

ipcMain.handle('mcq:encrypt', async (_event, content: string) => {
  return encryptMcq(content)
})

ipcMain.handle('mcq:decrypt', async (_event, content: string) => {
  return decryptMcq(content)
})

ipcMain.handle('export:assets', async () => {
  return getExportAssets()
})

ipcMain.handle('export:pdf', async (_event, html: string, outPath: string) => {
  const tempDir = join(tmpdir(), 'mcq-export')
  const htmlPath = join(tempDir, 'export.html')
  try {
    await mkdir(tempDir, { recursive: true })
    await writeFile(htmlPath, html, 'utf-8')

    const win = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: false, contextIsolation: true } })
    await win.loadFile(htmlPath)
    const pdf = await win.webContents.printToPDF({ printBackground: true })
    win.destroy()
    await writeFile(outPath, pdf)
    await rm(tempDir, { recursive: true, force: true })
    return true
  } catch (err) {
    await log(`Error exporting PDF: ${err}`)
    await rm(tempDir, { recursive: true, force: true })
    return false
  }
})

ipcMain.handle('app:getPaths', () => ({
  configDir: app.getPath('userData'),
  mcqOutputDir: join(homedir(), 'magnus', 'mcq-quiz-generator', 'mcqs'),
  logDir: join(homedir(), 'magnus', 'mcq-quiz-generator', 'logs')
}))

ipcMain.handle('log', async (_event, msg: string) => {
  await log(msg)
})

ipcMain.handle('shell:openExternal', async (_event, url: string) => {
  const { shell } = require('electron')
  await shell.openExternal(url)
})

const TERMINAL_FMS = ['yazi', 'ranger', 'nnn', 'lf', 'vifm', 'midnight-commander', 'mc']
const TERMINALS = ['x-terminal-emulator', 'xterm', 'konsole', 'alacritty', 'kitty', 'st']

ipcMain.handle('shell:openPath', async (_event, path: string, fileManager: string) => {
  const isTerminal = TERMINAL_FMS.includes(fileManager)
  if (isTerminal) {
    for (const term of TERMINALS) {
      try {
        await new Promise<void>((resolve, reject) => {
          execFile('which', [term], (err) => err ? reject(err) : resolve())
        })
        spawn(term, ['-e', fileManager, path], { detached: true, stdio: 'ignore' }).unref()
        return true
      } catch { /* try next terminal */ }
    }
    return false
  }
  try {
    await new Promise<void>((resolve, reject) => {
      execFile('which', [fileManager], (err) => err ? reject(err) : resolve())
    })
    spawn(fileManager, [path], { detached: true, stdio: 'ignore' }).unref()
    return true
  } catch {
    return false
  }
})
