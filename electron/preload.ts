import { contextBridge, ipcRenderer } from 'electron';
import type { UnderleafApi } from '../shared/types';

const api: UnderleafApi = {
  getBootstrapState: () => ipcRenderer.invoke('bootstrap-state'),
  listRecentProjects: () => ipcRenderer.invoke('list-recent-projects'),
  createProject: (name, directory) => ipcRenderer.invoke('create-project', name, directory),
  openProjectDialog: () => ipcRenderer.invoke('open-project-dialog'),
  openProject: (projectPath) => ipcRenderer.invoke('open-project', projectPath),
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  readTextFile: (filePath) => ipcRenderer.invoke('read-text-file', filePath),
  writeTextFile: (filePath, content) => ipcRenderer.invoke('write-text-file', filePath, content),
  readBinaryFile: (filePath) => ipcRenderer.invoke('read-binary-file', filePath),
  getTexStatus: () => ipcRenderer.invoke('get-tex-status'),
  installTexEngine: () => ipcRenderer.invoke('install-tex-engine'),
  compileProject: (projectPath, mainFilePath) => ipcRenderer.invoke('compile-project', projectPath, mainFilePath),
  onProjectRequestedOpen: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, projectPath: string) => listener(projectPath);
    ipcRenderer.on('project-requested-open', handler);
    return () => ipcRenderer.removeListener('project-requested-open', handler);
  },
  onCompileStatus: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, message: string) => listener(message);
    ipcRenderer.on('compile-status', handler);
    return () => ipcRenderer.removeListener('compile-status', handler);
  },
};

contextBridge.exposeInMainWorld('underleaf', api);
