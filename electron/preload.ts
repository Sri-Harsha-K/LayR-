import { contextBridge, ipcRenderer } from 'electron';
import type {
  IpcExportWavArgs,
  IpcOpenProjectResult,
  IpcSampleFile,
  IpcSaveProjectArgs,
  IpcSaveProjectResult,
} from './ipcContract';

// Sandboxed preload scripts (webPreferences.sandbox: true) can only require
// Electron/Node built-ins, not arbitrary local project files — so the
// channel names are inlined here rather than imported from ipcContract.ts
// (which main.ts, running unsandboxed, still imports IPC_CHANNELS from).
const CHANNELS = {
  openProject: 'project:open',
  saveProject: 'project:save',
  exportWav: 'export:wav',
  pickSample: 'sample:pick',
} as const;

const dawApi = {
  openProject: (): Promise<IpcOpenProjectResult | null> => ipcRenderer.invoke(CHANNELS.openProject),

  saveProject: (args: IpcSaveProjectArgs): Promise<IpcSaveProjectResult | null> =>
    ipcRenderer.invoke(CHANNELS.saveProject, args),

  exportWav: (args: IpcExportWavArgs): Promise<boolean> => ipcRenderer.invoke(CHANNELS.exportWav, args),

  pickSample: (): Promise<IpcSampleFile | null> => ipcRenderer.invoke(CHANNELS.pickSample),
};

export type DawApi = typeof dawApi;

contextBridge.exposeInMainWorld('daw', dawApi);
