import { contextBridge, ipcRenderer } from 'electron';
import {
  IPC_CHANNELS,
  type IpcExportWavArgs,
  type IpcOpenProjectResult,
  type IpcSampleFile,
  type IpcSaveProjectArgs,
  type IpcSaveProjectResult,
} from './ipcContract';

const dawApi = {
  openProject: (): Promise<IpcOpenProjectResult | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.openProject),

  saveProject: (args: IpcSaveProjectArgs): Promise<IpcSaveProjectResult | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.saveProject, args),

  exportWav: (args: IpcExportWavArgs): Promise<boolean> =>
    ipcRenderer.invoke(IPC_CHANNELS.exportWav, args),

  pickSample: (): Promise<IpcSampleFile | null> => ipcRenderer.invoke(IPC_CHANNELS.pickSample),
};

export type DawApi = typeof dawApi;

contextBridge.exposeInMainWorld('daw', dawApi);
