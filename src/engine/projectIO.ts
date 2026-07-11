// Bridges projectStore + sampleRegistry + the platform adapter for file I/O
// (open / save / save-as / autosave-recovery) — the one place these three
// cross, mirroring the role recordingController.ts plays for AudioEngine +
// the store. Nothing else should call platform.openProject/saveProject or
// registerSampleAtRef directly.
import { platform } from '../platform';
import type { AudioFilePayload, OpenedProject } from '../platform/types';
import { sanitizeProject, useProjectStore } from '../state/projectStore';
import { useUiStore } from '../state/uiStore';
import type { Project } from '../state/types';
import { getSampleBuffer, refToRelPath, registerSampleAtRef, relPathToRef } from './sampleRegistry';
import { encodeWav } from './wavEncoder';
import { recordRecentProject } from '../utils/recentProjects';

let lastSavedProject: Project | null = null;

function collectReferencedRefs(project: Project): Set<string> {
  const refs = new Set<string>();
  for (const track of project.tracks) {
    track.drumKit?.forEach((lane) => {
      if (lane.sampleRef) refs.add(lane.sampleRef);
    });
    for (const clip of track.clips) {
      if (clip.kind === 'audio') refs.add(clip.fileRef);
    }
  }
  return refs;
}

/** Encodes every currently-resolvable sample referenced by the project as WAV bytes, keyed by its deterministic relPath. */
export function collectAudioFiles(project: Project): AudioFilePayload[] {
  const files: AudioFilePayload[] = [];
  for (const ref of collectReferencedRefs(project)) {
    const buffer = getSampleBuffer(ref);
    if (!buffer) continue; // referenced but not resolvable this session — nothing to persist
    files.push({ relPath: refToRelPath(ref), data: encodeWav(buffer).buffer });
  }
  return files;
}

async function hydrateAudioFiles(audioFiles: AudioFilePayload[]): Promise<void> {
  await Promise.all(audioFiles.map((file) => registerSampleAtRef(relPathToRef(file.relPath), file.data)));
}

export function isProjectDirty(project: Project): boolean {
  return project !== lastSavedProject;
}

function markSaved(project: Project): void {
  lastSavedProject = project;
  useUiStore.getState().setProjectDirty(false);
  recordRecentProject(project.name);
}

async function loadOpened(opened: OpenedProject): Promise<Project> {
  await hydrateAudioFiles(opened.audioFiles);
  const project = sanitizeProject(opened.project);
  useProjectStore.getState().loadProject(project);
  // A manual loop range from a previous project in this session shouldn't
  // carry over to a freshly-opened one — resume auto-following its own
  // arrangement length (useAudioEngine.ts recomputes it right after).
  useUiStore.getState().setLoopFollowsArrangement(true);
  return project;
}

// Save/open used to call the platform picker with no try/catch at all —
// a real failure (permission denied, unsupported browser, a picker error
// that isn't a plain user-cancel) became an unhandled promise rejection
// with zero UI feedback, since every call site does `void saveProject()`.
// Every entry point below now catches and surfaces the message via
// uiStore's toast instead of failing silently.
function reportFailure(err: unknown, fallback: string): void {
  useUiStore.getState().setToast(err instanceof Error ? err.message : fallback);
}

export async function saveProject(): Promise<boolean> {
  const project = useProjectStore.getState().project;
  const projectDirPath = useUiStore.getState().openProjectRef;
  try {
    const result = await platform.saveProject(project, collectAudioFiles(project), projectDirPath);
    if (!result) return false; // user cancelled the picker — not an error
    if (result.projectDirPath) useUiStore.getState().setOpenProjectRef(result.projectDirPath);
    markSaved(project);
    return true;
  } catch (err) {
    reportFailure(err, 'Could not save the project.');
    return false;
  }
}

export async function saveProjectAs(): Promise<boolean> {
  const project = useProjectStore.getState().project;
  try {
    const result = await platform.saveProject(project, collectAudioFiles(project), undefined);
    if (!result) return false;
    if (result.projectDirPath) useUiStore.getState().setOpenProjectRef(result.projectDirPath);
    markSaved(project);
    return true;
  } catch (err) {
    reportFailure(err, 'Could not save the project.');
    return false;
  }
}

export async function openProject(): Promise<boolean> {
  try {
    const opened = await platform.openProject();
    if (!opened) return false;
    const project = await loadOpened(opened);
    useUiStore.getState().setOpenProjectRef(opened.projectDirPath);
    markSaved(project);
    return true;
  } catch (err) {
    reportFailure(err, 'Could not open the project.');
    return false;
  }
}

/**
 * Boot-time crash recovery: loads an autosaved snapshot without marking it
 * saved, so the dirty indicator immediately prompts a real save rather than
 * silently treating a recovered draft as up-to-date on disk.
 */
export async function recoverAutosave(): Promise<boolean> {
  try {
    const snapshot = await platform.loadAutosave();
    if (!snapshot) return false;
    await loadOpened(snapshot);
    return true;
  } catch (err) {
    // Boot-time recovery — a corrupt/unreadable autosave should never block
    // startup. sanitizeProject() itself doesn't throw, but IndexedDB access
    // and JSON decoding upstream of it can.
    reportFailure(err, 'Could not recover the autosaved project.');
    return false;
  }
}

export async function autosaveNow(): Promise<void> {
  const project = useProjectStore.getState().project;
  await platform.autosave(project, collectAudioFiles(project));
}
