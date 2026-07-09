// Desktop-vs-browser file I/O surface. Electron implements this over IPC
// through the typed preload bridge; the browser implements it over
// IndexedDB. Nothing above this interface should know which one is active.

import type { Project } from '../state/types';

export interface AudioFilePayload {
  /** Relative path inside the project's /audio folder, e.g. "audio/kick-user.wav" */
  relPath: string;
  data: ArrayBuffer;
}

export interface OpenedProject {
  project: Project;
  /** Electron: absolute path to the .dawproj folder. Browser: undefined. */
  projectDirPath?: string;
  audioFiles: AudioFilePayload[];
}

export interface SampleFile {
  name: string;
  data: ArrayBuffer;
}

export interface PlatformAdapter {
  readonly isElectron: boolean;

  /** Opens a native/browser picker and loads a project. Null if cancelled. */
  openProject(): Promise<OpenedProject | null>;

  /**
   * Saves the project. If `projectDirPath` is provided (Electron, "Save"),
   * writes in place; otherwise prompts for a location ("Save As").
   */
  saveProject(
    project: Project,
    audioFiles: AudioFilePayload[],
    projectDirPath?: string,
  ): Promise<{ projectDirPath?: string } | null>;

  /** Prompts for a destination and writes the exported bytes. `suggestedFileName` already includes the real extension (.wav/.mp3/.zip/...) — this method is format-agnostic. */
  exportFile(bytes: Uint8Array<ArrayBuffer>, suggestedFileName: string): Promise<boolean>;

  /** Opens a file picker for a user audio sample (drum lane override). */
  pickSampleFile(): Promise<SampleFile | null>;

  /** Best-effort periodic snapshot for crash recovery. No-op is acceptable. */
  autosave(project: Project, audioFiles: AudioFilePayload[]): Promise<void>;

  /** Returns the last autosaved snapshot, if any (browser crash recovery). */
  loadAutosave(): Promise<OpenedProject | null>;

  clearAutosave(): Promise<void>;
}
