import { useProjectStore } from '../state/projectStore';
import { useUiStore } from '../state/uiStore';
import type { Track } from '../state/types';

function MiniToggle({
  label,
  active,
  danger,
  onClick,
}: {
  label: string;
  active: boolean;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={[
        'h-5 w-5 rounded border text-[10px] font-semibold leading-none transition-colors',
        danger
          ? active
            ? 'border-record bg-record text-surface-0'
            : 'border-hairline text-ink-faint hover:text-record'
          : active
            ? 'border-meter-amber bg-meter-amber/20 text-meter-amber'
            : 'border-hairline text-ink-faint hover:text-ink',
      ].join(' ')}
    >
      {label[0]}
    </button>
  );
}

function TrackHeaderRow({ track }: { track: Track }) {
  const updateMixer = useProjectStore((s) => s.updateTrackMixer);
  const setArmed = useProjectStore((s) => s.setTrackArmed);
  const selection = useUiStore((s) => s.selection);
  const selectTrack = useUiStore((s) => s.selectTrack);

  const isSelected = selection.trackId === track.id;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => selectTrack(track.id)}
      onKeyDown={(e) => e.key === 'Enter' && selectTrack(track.id)}
      className={[
        'flex h-16 shrink-0 items-center gap-2 border-b border-hairline px-2 text-left',
        isSelected ? 'bg-surface-2' : 'hover:bg-surface-1',
      ].join(' ')}
      style={{ borderLeft: `3px solid ${track.color}` }}
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-ink">{track.name}</div>
        <div className="truncate text-xs text-ink-faint capitalize">{track.kind}</div>
      </div>
      <div className="flex items-center gap-1">
        {track.kind === 'audio' && (
          <MiniToggle
            label="Arm"
            danger
            active={!!track.armed}
            onClick={() => setArmed(track.id, !track.armed)}
          />
        )}
        <MiniToggle
          label="Mute"
          active={track.mixer.mute}
          onClick={() => updateMixer(track.id, { mute: !track.mixer.mute })}
        />
        <MiniToggle
          label="Solo"
          active={track.mixer.solo}
          onClick={() => updateMixer(track.id, { solo: !track.mixer.solo })}
        />
      </div>
    </div>
  );
}

export function TrackRail() {
  const tracks = useProjectStore((s) => s.project.tracks);
  const addTrack = useProjectStore((s) => s.addTrack);
  const addDefaultPatternClip = useProjectStore((s) => s.addDefaultPatternClip);
  const selectClip = useUiStore((s) => s.selectClip);
  const setBottomPanelTab = useUiStore((s) => s.setBottomPanelTab);

  const handleAddDrumTrack = () => {
    const trackId = addTrack('drum');
    const clipId = addDefaultPatternClip(trackId);
    selectClip(trackId, clipId);
    setBottomPanelTab('stepsequencer');
  };

  return (
    <aside className="flex w-56 shrink-0 flex-col overflow-y-auto border-r border-hairline bg-surface-1">
      {tracks.map((t) => (
        <TrackHeaderRow key={t.id} track={t} />
      ))}
      <div className="flex gap-1 p-2">
        <button
          type="button"
          onClick={handleAddDrumTrack}
          className="flex-1 rounded-md border border-dashed border-hairline px-2 py-1.5 text-xs text-ink-dim hover:border-track-1 hover:text-track-1"
        >
          + Drum
        </button>
        <button
          type="button"
          onClick={() => addTrack('synth')}
          className="flex-1 rounded-md border border-dashed border-hairline px-2 py-1.5 text-xs text-ink-dim hover:border-track-4 hover:text-track-4"
        >
          + Synth
        </button>
        <button
          type="button"
          onClick={() => addTrack('audio')}
          className="flex-1 rounded-md border border-dashed border-hairline px-2 py-1.5 text-xs text-ink-dim hover:border-track-6 hover:text-track-6"
        >
          + Audio
        </button>
      </div>
    </aside>
  );
}
