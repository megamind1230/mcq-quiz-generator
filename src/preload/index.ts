import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  openFile: (filters?: { name: string; extensions: string[] }[]) =>
    ipcRenderer.invoke('dialog:openFile', filters),
  openDirectory: () =>
    ipcRenderer.invoke('dialog:openDirectory'),
  readFile: (filePath: string) =>
    ipcRenderer.invoke('file:read', filePath),
  writeFile: (filePath: string, content: string) =>
    ipcRenderer.invoke('file:write', filePath, content),
  listFiles: (dirPath: string, ext?: string) =>
    ipcRenderer.invoke('file:list', dirPath, ext),
  readMcqMetadata: (dirPath: string) =>
    ipcRenderer.invoke('file:mcqMetadata', dirPath),
  ensureDir: (dirPath: string) =>
    ipcRenderer.invoke('dir:ensure', dirPath),
  log: (msg: string) =>
    ipcRenderer.invoke('log', msg),
  openExternal: (url: string) =>
    ipcRenderer.invoke('shell:openExternal', url),
  openPath: (path: string, fileManager: string) =>
    ipcRenderer.invoke('shell:openPath', path, fileManager),
  getPaths: () =>
    ipcRenderer.invoke('app:getPaths')
})
