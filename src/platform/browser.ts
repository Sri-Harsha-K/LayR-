import type { AudioFilePayload, OpenedProject, PlatformAdapter, SampleFile } from './types';

// Minimal IndexedDB helper. Fleshed out fully in Phase 5 (autosave + crash
// recovery); Phase 0 just needs a working, non-throwing implementation so
// the app is usable in browser dev mode from day one.

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
    // Browser dev mode has no folder picker; project open happens via
    // crash-recovery autosave or drag/drop, implemented in Phase 5.
    return null;
  },

  async saveProject(): Promise<{ projectDirPath?: string } | null> {
    // Real "download as .dawproj" flow lands in Phase 5.
    return null;
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
