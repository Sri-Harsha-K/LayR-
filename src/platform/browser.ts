import type { AudioFilePayload, OpenedProject, PlatformAdapter, SampleFile } from './types';
import type { Project } from '../state/types';
import { generateId } from '../utils/id';

// File System Access API additions TypeScript's bundled DOM lib doesn't
// include yet (it has the FileSystemDirectoryHandle/FileSystemFileHandle/
// FileSystemWritableFileStream interfaces from an older spec draft, but not
// the `showDirectoryPicker` entry point or the permission methods) —
// narrow ambient declarations, feature-detected at runtime.
declare global {
  interface Window {
    showDirectoryPicker?(options?: { mode?: 'read' | 'readwrite' }): Promise<FileSystemDirectoryHandle>;
  }
  interface FileSystemHandle {
    queryPermission?(options?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>;
    requestPermission?(options?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>;
  }
}

const PROJECT_FILE = 'project.json';
const AUDIO_DIR = 'audio';

// PlatformAdapter's saveProject/openProject pass a `projectDirPath: string`
// to mean "save in place" / identify what was opened — designed around
// Electron's real path string. A FileSystemDirectoryHandle isn't a string
// and (for security) exposes no path, so this adapter stays stateful
// instead: it caches opened/saved handles here, keyed by a generated id,
// and hands that id back as the "projectDirPath". Callers (projectIO.ts)
// stay platform-agnostic — the whole point of PlatformAdapter.
const openHandles = new Map<string, FileSystemDirectoryHandle>();

function supportsFileSystemAccess(): boolean {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
}

async function ensureReadWritePermission(handle: FileSystemDirectoryHandle): Promise<void> {
  const opts = { mode: 'readwrite' as const };
  if ((await handle.queryPermission?.(opts)) === 'granted') return;
  await handle.requestPermission?.(opts);
}

async function writeProjectDirectory(
  handle: FileSystemDirectoryHandle,
  project: Project,
  audioFiles: AudioFilePayload[],
): Promise<void> {
  const projectFileHandle = await handle.getFileHandle(PROJECT_FILE, { create: true });
  const projectWritable = await projectFileHandle.createWritable();
  await projectWritable.write(JSON.stringify(project));
  await projectWritable.close();

  if (audioFiles.length === 0) return;
  const audioDirHandle = await handle.getDirectoryHandle(AUDIO_DIR, { create: true });
  for (const file of audioFiles) {
    const name = file.relPath.startsWith(`${AUDIO_DIR}/`) ? file.relPath.slice(AUDIO_DIR.length + 1) : file.relPath;
    const fileHandle = await audioDirHandle.getFileHandle(name, { create: true });
    const fileWritable = await fileHandle.createWritable();
    await fileWritable.write(file.data);
    await fileWritable.close();
  }
}

async function readProjectDirectory(
  handle: FileSystemDirectoryHandle,
): Promise<{ project: Project; audioFiles: AudioFilePayload[] }> {
  const projectFileHandle = await handle.getFileHandle(PROJECT_FILE);
  const projectFile = await projectFileHandle.getFile();
  const project = JSON.parse(await projectFile.text()) as Project;

  const audioFiles: AudioFilePayload[] = [];
  try {
    const audioDirHandle = await handle.getDirectoryHandle(AUDIO_DIR);
    for await (const [name, entryHandle] of audioDirHandle.entries()) {
      if (entryHandle.kind !== 'file') continue;
      const file = await entryHandle.getFile();
      audioFiles.push({ relPath: `${AUDIO_DIR}/${name}`, data: await file.arrayBuffer() });
    }
  } catch {
    // no audio folder — fine for a project with no samples
  }

  return { project, audioFiles };
}

// Minimal IndexedDB helper — crash-recovery autosave, independent of the
// File System Access flow above (works in every browser, not just Chromium).

const DB_NAME = 'local-daw';
const DB_VERSION = 1;
const STORE = 'autosave';
const AUTOSAVE_KEY = 'current';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbDelete(key: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export const browserPlatform: PlatformAdapter = {
  isElectron: false,

  async openProject(): Promise<OpenedProject | null> {
    if (!supportsFileSystemAccess()) return null; // Firefox/Safari: no real open, autosave recovery is the safety net
    let handle: FileSystemDirectoryHandle;
    try {
      handle = await window.showDirectoryPicker!({ mode: 'readwrite' });
    } catch {
      return null; // user cancelled the picker
    }
    await ensureReadWritePermission(handle);
    const { project, audioFiles } = await readProjectDirectory(handle);
    const key = generateId('dir');
    openHandles.set(key, handle);
    return { project, projectDirPath: key, audioFiles };
  },

  async saveProject(
    project: Project,
    audioFiles: AudioFilePayload[],
    projectDirPath?: string,
  ): Promise<{ projectDirPath?: string } | null> {
    if (!supportsFileSystemAccess()) return null;
    let handle = projectDirPath ? openHandles.get(projectDirPath) : undefined;
    if (!handle) {
      try {
        handle = await window.showDirectoryPicker!({ mode: 'readwrite' });
      } catch {
        return null; // user cancelled the picker
      }
    }
    await ensureReadWritePermission(handle);
    await writeProjectDirectory(handle, project, audioFiles);
    const key = projectDirPath && openHandles.has(projectDirPath) ? projectDirPath : generateId('dir');
    openHandles.set(key, handle);
    return { projectDirPath: key };
  },

  async exportWav(bytes: Uint8Array<ArrayBuffer>, suggestedName: string): Promise<boolean> {
    const blob = new Blob([bytes], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = suggestedName.endsWith('.wav') ? suggestedName : `${suggestedName}.wav`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return true;
  },

  async pickSampleFile(): Promise<SampleFile | null> {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'audio/*';
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) {
          resolve(null);
          return;
        }
        resolve({ name: file.name, data: await file.arrayBuffer() });
      };
      input.click();
    });
  },

  async autosave(project, audioFiles: AudioFilePayload[]): Promise<void> {
    await idbSet(AUTOSAVE_KEY, { project, audioFiles, savedAt: Date.now() });
  },

  async loadAutosave(): Promise<OpenedProject | null> {
    const snapshot = await idbGet<{ project: OpenedProject['project']; audioFiles: AudioFilePayload[] }>(
      AUTOSAVE_KEY,
    );
    if (!snapshot) return null;
    return { project: snapshot.project, audioFiles: snapshot.audioFiles };
  },

  async clearAutosave(): Promise<void> {
    await idbDelete(AUTOSAVE_KEY);
  },
};
