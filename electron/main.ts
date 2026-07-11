import { app, BrowserWindow, dialog, ipcMain, session } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import {
  IPC_CHANNELS,
  type IpcExportWavArgs,
  type IpcOpenProjectResult,
  type IpcSampleFile,
  type IpcSaveProjectArgs,
  type IpcSaveProjectResult,
} from './ipcContract';

const isDev = !app.isPackaged;
const DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];

const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data:; media-src 'self'; worker-src 'self' blob:; " +
  "connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none';";

/** Resolves `relPath` against `baseDir` and throws if the result would land outside it — the zip-slip guard for the one real filesystem write this app does with a caller-supplied relative path (see engine/zipReader.ts's own read-side guard for the other end of this same concern). */
function resolveWithinDir(baseDir: string, relPath: string): string {
  const base = path.resolve(baseDir);
  const resolved = path.resolve(base, relPath);
  if (resolved !== base && !resolved.startsWith(base + path.sep)) {
    throw new Error(`Refusing to write outside the project folder: ${relPath}`);
  }
  return resolved;
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#1c1a18',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'media');
  });

  // Dev mode is deliberately left untouched — Vite's HMR client/websocket
  // and dev-mode module loading aren't guaranteed compatible with this
  // policy, and dev mode isn't a real security boundary anyway (DevTools
  // are already open). This only protects the actual shipped artifact.
  if (!isDev) {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [CSP],
        },
      });
    });
  }

  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  win.webContents.on('will-navigate', (event, navigationUrl) => {
    // Same-URL reloads (Vite HMR's full-reload fallback, Ctrl+R) are fine —
    // only block navigating to a *different* URL, which nothing in this
    // app's renderer ever legitimately does.
    if (navigationUrl !== win.webContents.getURL()) {
      event.preventDefault();
    }
  });

  if (isDev) {
    // Relay renderer console output to the main-process stdout so runtime
    // errors are visible without opening DevTools by hand.
    win.webContents.on('console-message', (event) => {
      if (event.level === 'error' || event.level === 'warning') {
        console.log(`[renderer:${event.level}] ${event.message} (${event.sourceId}:${event.lineNumber})`);
      }
    });
    win.webContents.on('render-process-gone', (_event, details) => {
      console.error('[renderer] process gone:', details.reason);
    });
  }

  if (isDev && DEV_SERVER_URL) {
    void win.loadURL(DEV_SERVER_URL);
  } else {
    void win.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// --- IPC: file operations. Full implementations land in Phase 5; for now
// these back the dialogs so save/open/export/pick-sample all work end to end
// against a real project folder on disk. ---

ipcMain.handle(IPC_CHANNELS.openProject, async (): Promise<IpcOpenProjectResult | null> => {
  const result = await dialog.showOpenDialog({
    title: 'Open Project',
    properties: ['openDirectory'],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const projectDirPath = result.filePaths[0]!;
  const projectJsonPath = path.join(projectDirPath, 'project.json');
  const projectJson = await fs.readFile(projectJsonPath, 'utf-8');

  const audioFiles: { relPath: string; data: ArrayBuffer }[] = [];
  const audioDir = path.join(projectDirPath, 'audio');
  try {
    const entries = await fs.readdir(audioDir);
    for (const entry of entries) {
      const buf = await fs.readFile(path.join(audioDir, entry));
      audioFiles.push({
        relPath: `audio/${entry}`,
        data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
      });
    }
  } catch {
    // no audio folder yet - fine for a fresh project
  }

  return { projectJson, projectDirPath, audioFiles };
});

ipcMain.handle(
  IPC_CHANNELS.saveProject,
  async (_evt, args: IpcSaveProjectArgs): Promise<IpcSaveProjectResult | null> => {
    let projectDirPath = args.projectDirPath;
    if (!projectDirPath) {
      const result = await dialog.showSaveDialog({
        title: 'Save Project As',
        defaultPath: `${args.suggestedName}.dawproj`,
      });
      if (result.canceled || !result.filePath) return null;
      projectDirPath = result.filePath;
    }

    await fs.mkdir(projectDirPath, { recursive: true });
    await fs.mkdir(path.join(projectDirPath, 'audio'), { recursive: true });
    await fs.writeFile(path.join(projectDirPath, 'project.json'), args.projectJson, 'utf-8');
    for (const file of args.audioFiles) {
      await fs.writeFile(resolveWithinDir(projectDirPath, file.relPath), Buffer.from(file.data));
    }
    return { projectDirPath };
  },
);

ipcMain.handle(IPC_CHANNELS.exportWav, async (_evt, args: IpcExportWavArgs): Promise<boolean> => {
  // Despite the channel's name (kept as-is, see platform/electron.ts's own
  // comment on why), `suggestedName` always already carries its real
  // extension now — WAV, MP3, or a stems .zip — so the dialog filter is
  // derived from it instead of being hardcoded to WAV.
  const ext = path.extname(args.suggestedName).slice(1).toLowerCase() || 'wav';
  const result = await dialog.showSaveDialog({
    title: 'Export',
    defaultPath: args.suggestedName,
    filters: [{ name: `${ext.toUpperCase()} File`, extensions: [ext] }],
  });
  if (result.canceled || !result.filePath) return false;
  await fs.writeFile(result.filePath, Buffer.from(args.bytes));
  return true;
});

ipcMain.handle(IPC_CHANNELS.pickSample, async (): Promise<IpcSampleFile | null> => {
  const result = await dialog.showOpenDialog({
    title: 'Choose Sample',
    properties: ['openFile'],
    filters: [{ name: 'Audio', extensions: ['wav', 'mp3', 'ogg', 'aiff', 'flac'] }],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const filePath = result.filePaths[0]!;
  const buf = await fs.readFile(filePath);
  return {
    name: path.basename(filePath),
    data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
  };
});
