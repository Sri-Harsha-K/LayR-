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
      await fs.writeFile(path.join(projectDirPath, file.relPath), Buffer.from(file.data));
    }
    return { projectDirPath };
  },
);

ipcMain.handle(IPC_CHANNELS.exportWav, async (_evt, args: IpcExportWavArgs): Promise<boolean> => {
  const result = await dialog.showSaveDialog({
    title: 'Bounce to WAV',
    defaultPath: args.suggestedName.endsWith('.wav') ? args.suggestedName : `${args.suggestedName}.wav`,
    filters: [{ name: 'WAV Audio', extensions: ['wav'] }],
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
