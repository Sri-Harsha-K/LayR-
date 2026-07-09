// A small "recently worked on" list for the Start screen — informational
// only, not a direct-reopen mechanism. Genuinely bypassing the native/
// browser file picker on click would need a new Electron IPC method (to
// reopen a known path with no dialog) and, in the browser, persisting a
// FileSystemDirectoryHandle across sessions — real but non-trivial surface
// this pass didn't add. Clicking a recent entry still opens the normal
// platform.openProject() picker; this list just reminds you what to look for.
const STORAGE_KEY = 'layr:recentProjects';
const MAX_ENTRIES = 5;

export interface RecentProjectEntry {
  name: string;
  lastOpenedAt: number;
}

export function getRecentProjects(): RecentProjectEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as RecentProjectEntry[];
  } catch {
    return [];
  }
}

export function recordRecentProject(name: string): void {
  try {
    const next = [{ name, lastOpenedAt: Date.now() }, ...getRecentProjects().filter((p) => p.name !== name)].slice(
      0,
      MAX_ENTRIES,
    );
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // localStorage unavailable (disabled, private mode, ...) — recents just don't persist, not fatal
  }
}
