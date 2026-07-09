import { useProjectStore } from '../state/projectStore';
import { useUiStore } from '../state/uiStore';
import { openProject } from '../engine/projectIO';
import { getRecentProjects } from '../utils/recentProjects';
import { applyProjectTemplate, type ProjectTemplate } from '../utils/projectTemplates';

const TEMPLATES: { id: ProjectTemplate; label: string; description: string }[] = [
  { id: 'beat', label: 'Beat', description: 'One drum track, ready to program' },
  { id: 'podcast', label: 'Podcast', description: 'One audio track for a mic' },
  { id: 'band', label: 'Band session', description: 'Drums, bass, keys, vocal' },
];

function formatRelativeTime(ms: number): string {
  const diffMinutes = Math.round((Date.now() - ms) / 60000);
  if (diffMinutes < 1) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.round(diffHours / 24)}d ago`;
}

export function StartScreen() {
  const addTrack = useProjectStore((s) => s.addTrack);
  const addDefaultPatternClip = useProjectStore((s) => s.addDefaultPatternClip);
  const selectClip = useUiStore((s) => s.selectClip);
  const setBottomPanelTab = useUiStore((s) => s.setBottomPanelTab);
  const recents = getRecentProjects();

  const handleNewEmptyProject = () => {
    const trackId = addTrack('drum');
    const clipId = addDefaultPatternClip(trackId);
    selectClip(trackId, clipId);
    setBottomPanelTab('stepsequencer');
  };

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 text-ink-faint">
      <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-accent text-surface-0" aria-hidden>
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
        </svg>
      </span>
      <div className="text-center">
        <p className="text-lg text-ink">Start something</p>
        <p className="text-sm text-ink-faint">No project open — pick a way in.</p>
      </div>

      <div className="flex w-full max-w-md flex-col gap-2">
        <button
          type="button"
          onClick={handleNewEmptyProject}
          className="flex items-center justify-between rounded-md border border-accent bg-accent/10 px-4 py-3 text-left text-accent hover:bg-accent/20"
        >
          <span>
            <span className="block text-sm">New empty project</span>
            <span className="block text-xs text-accent/70">Blank timeline, ready to record</span>
          </span>
          <span className="label-mono">⌘N</span>
        </button>

        <button
          type="button"
          onClick={() => void openProject()}
          className="flex items-center justify-between rounded-md border border-hairline px-4 py-3 text-left hover:border-ink-faint"
        >
          <span>
            <span className="block text-sm text-ink">Open recent</span>
            <span className="block text-xs text-ink-faint">
              {recents[0] ? `${recents[0].name} · ${formatRelativeTime(recents[0].lastOpenedAt)}` : 'Opens the file picker'}
            </span>
          </span>
          <span className="label-mono">⌘O</span>
        </button>

        <div className="rounded-md border border-hairline px-4 py-3">
          <span className="block text-sm text-ink">Start from a template</span>
          <div className="mt-2 flex gap-2">
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => applyProjectTemplate(t.id)}
                title={t.description}
                className="flex-1 rounded border border-hairline px-2 py-1.5 text-xs text-ink-dim hover:border-accent hover:text-accent"
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
