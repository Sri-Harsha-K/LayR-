import type { AudioFilePayload, OpenedProject, PlatformAdapter, SampleFile } from './types';
import type { Project } from '../state/types';

interface IpcAudioFile {
  relPath: string;
  data: ArrayBuffer;
}

interface DawApi {
  openProject(): Promise<{ projectJson: string; projectDirPath: string; audioFiles: IpcAudioFile[] } | null>;
  saveProject(args: {
    projectJson: string;
    audioFiles: IpcAudioFile[];
    projectDirPath?: string;
    suggestedName: string;
  }): Promise<{ projectDirPath: string } | null>;
  exportWav(args: { bytes: ArrayBuffer; suggestedName: string }): Promise<boolean>;
  pickSample(): Promise<SampleFile | null>;
}

declare global {
  interface Window {
    daw?: DawApi;
  }
}

function getApi(): DawApi {
  const api = window.daw;
  if (!api) throw new Error('Electron bridge (window.daw) is unavailable');
  return api;
}

export const electronPlatform: PlatformAdapter = {
  isElectron: true,

  async openProject(): Promise<OpenedProject | null> {
    const result = await getApi().openProject();
    if (!result) return null;
    const project = JSON.parse(result.projectJson) as Project;
    return { project, projectDirPath: result.projectDirPath, audioFiles: result.audioFiles };
  },

  async saveProject(
    project: Project,
    audioFiles: AudioFilePayload[],
    projectDirPath?: string,
  ): Promise<{ projectDirPath?: string } | null> {
    const result = await getApi().saveProject({
      projectJson: JSON.stringify(project),
      audioFiles,
      projectDirPath,
      suggestedName: project.name,
    });
    if (!result) return null;
    return { projectDirPath: result.projectDirPath };
  },

  async exportFile(bytes: Uint8Array<ArrayBuffer>, suggestedFileName: string): Promise<boolean> {
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    // The IPC channel/method are still named "exportWav" (see ipcContract.ts)
    // — only the renderer-facing PlatformAdapter method needed the more
    // accurate name, since the wire format was already format-agnostic
    // (just bytes + a filename) and renaming the channel too would mean
    // keeping preload.ts's manually-duplicated channel strings in sync for
    // no functional reason.
    return getApi().exportWav({ bytes: buffer, suggestedName: suggestedFileName });
  },

  async pickSampleFile(): Promise<SampleFile | null> {
    return getApi().pickSample();
  },

  async autosave(): Promise<void> {
    // Electron persists explicitly via Cmd/Ctrl+S to a real project folder;
    // periodic autosave is a browser-only crash-recovery concern.
  },

  async loadAutosave(): Promise<OpenedProject | null> {
    return null;
  },

  async clearAutosave(): Promise<void> {
    // no-op
  },
};
