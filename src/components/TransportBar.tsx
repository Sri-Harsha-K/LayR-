import { useUiStore } from '../state/uiStore';
import { useProjectStore } from '../state/projectStore';

function IconButton({
  label,
  active,
  danger,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  danger?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={[
        'flex h-9 w-9 items-center justify-center rounded-md border transition-colors',
        danger
          ? active
            ? 'border-record bg-record text-surface-0'
            : 'border-hairline text-record hover:border-record'
          : active
            ? 'border-track-4 bg-track-4/20 text-track-4'
            : 'border-hairline text-ink-dim hover:text-ink hover:border-ink-faint',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

export function TransportBar() {
  const bpm = useProjectStore((s) => s.project.bpm);
  const setBpm = useProjectStore((s) => s.setBpm);
  const loopEnabled = useUiStore((s) => s.loopEnabled);
  const setLoopEnabled = useUiStore((s) => s.setLoopEnabled);
  const metronomeEnabled = useUiStore((s) => s.metronomeEnabled);
  const setMetronomeEnabled = useUiStore((s) => s.setMetronomeEnabled);

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-hairline bg-surface-1 px-4">
      <div className="flex items-center gap-2">
        <IconButton label="Play / Stop (Space)" active={false}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
        </IconButton>
        <IconButton label="Record (R)" danger>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
            <circle cx="12" cy="12" r="8" />
          </svg>
        </IconButton>
        <IconButton label="Return to zero (Enter)">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <path d="M6 5h2v14H6zM20 6l-9 6 9 6z" />
          </svg>
        </IconButton>
        <IconButton label="Loop (L)" active={loopEnabled} onClick={() => setLoopEnabled(!loopEnabled)}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M17 2l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M3 11V9a4 4 0 0 1 4-4h14" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M7 22l-4-4 4-4" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M21 13v2a4 4 0 0 1-4 4H3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </IconButton>
        <IconButton
          label="Metronome (click to toggle)"
          active={metronomeEnabled}
          onClick={() => setMetronomeEnabled(!metronomeEnabled)}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M8 21h8M12 3l6 18H6z" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M12 8l3 9" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </IconButton>
      </div>

      <div className="flex items-center gap-6">
        <label className="flex items-center gap-2 text-sm text-ink-dim">
          BPM
          <input
            type="number"
            min={40}
            max={240}
            value={bpm}
            onChange={(e) => setBpm(Number(e.target.value))}
            className="tabular w-16 rounded border border-hairline bg-surface-2 px-2 py-1 text-center text-ink"
          />
        </label>
        <div className="tabular font-mono text-lg text-ink" aria-label="Position">
          001:1:01
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex h-6 w-24 items-center gap-[2px] rounded bg-surface-2 px-1" aria-label="Master meter">
          {Array.from({ length: 16 }).map((_, i) => (
            <span key={i} className="h-3 flex-1 rounded-sm bg-surface-3" />
          ))}
        </div>
        <button
          type="button"
          disabled
          className="rounded-md border border-hairline px-3 py-1.5 text-sm text-ink-dim opacity-60"
          title="Bounce to WAV (available once the engine is wired up)"
        >
          Bounce to WAV
        </button>
      </div>
    </header>
  );
}
