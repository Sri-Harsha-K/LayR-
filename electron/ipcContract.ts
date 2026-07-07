// Shared shape for the main <-> preload <-> renderer IPC surface. Deliberately
// has no dependency on /src so the electron/ TS project stays self-contained.

export interface IpcAudioFile {
  relPath: string;
  data: ArrayBuffer;
}

export interface IpcOpenProjectResult {
  projectJson: string;
  projectDirPath: string;
  audioFiles: IpcAudioFile[];
}

export interface IpcSaveProjectArgs {
  projectJson: string;
  audioFiles: IpcAudioFile[];
  projectDirPath?: string;
  suggestedName: string;
}

export interface IpcSaveProjectResult {
  projectDirPath: string;
}

export interface IpcExportWavArgs {
  bytes: ArrayBuffer;
  suggestedName: string;
}

export interface IpcSampleFile {
  name: string;
  data: ArrayBuffer;
}

// Used by main.ts only. preload.ts runs sandboxed and can't require local
// modules, so it keeps its own inlined copy of these same string values —
// keep the two in sync if a channel name ever changes.
export const IPC_CHANNELS = {
  openProject: 'project:open',
  saveProject: 'project:save',
  exportWav: 'export:wav',
  pickSample: 'sample:pick',
} as const;
