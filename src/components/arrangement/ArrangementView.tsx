import { useProjectStore } from '../../state/projectStore';
import { useUiStore } from '../../state/uiStore';
import { TICKS_PER_BEAT } from '../../engine/time';
import type { Clip, Track } from '../../state/types';

function clipLabel(clip: Clip): string {
  if (clip.kind === 'pattern') return 'Pattern';
  if (clip.kind === 'midi') return 'MIDI';
  return 'Audio';
}

function ClipBlock({ track, clip }: { track: Track; clip: Clip }) {
  const selection = useUiStore((s) => s.selection);
  const selectClip = useUiStore((s) => s.selectClip);
  const setBottomPanelTab = useUiStore((s) => s.setBottomPanelTab);
  const pxPerBeat = useUiStore((s) => s.pxPerBeat);

  const pxPerTick = pxPerBeat / TICKS_PER_BEAT;
  const isSelected = selection.trackId === track.id && selection.clipId === clip.id;

  return (
    <button
      type="button"
      onClick={() => {
        selectClip(track.id, clip.id);
        setBottomPanelTab(clip.kind === 'pattern' ? 'stepsequencer' : clip.kind === 'midi' ? 'pianoroll' : 'mixer');
      }}
      className={[
        'absolute top-1 bottom-1 flex items-center justify-start overflow-hidden rounded px-2 text-left text-xs transition-colors',
        isSelected ? 'ring-2 ring-track-4' : '',
      ].join(' ')}
      style={{
        left: clip.startTicks * pxPerTick,
        width: Math.max(24, clip.lengthTicks * pxPerTick),
        backgroundColor: `${track.color}33`,
        borderLeft: `2px solid ${track.color}`,
        color: 'var(--color-ink)',
      }}
      title={`${clipLabel(clip)} clip`}
    >
      {clipLabel(clip)}
    </button>
  );
}

export function ArrangementView() {
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

  if (tracks.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-ink-faint">
        <p>Nothing here yet.</p>
        <button
          type="button"
          onClick={handleAddDrumTrack}
          className="rounded-md border border-track-1 px-4 py-2 text-sm text-track-1 transition-colors hover:bg-track-1/10"
        >
          Add a drum track
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      {tracks.map((t) => (
        <div key={t.id} className="relative h-16 border-b border-hairline">
          {t.clips.map((clip) => (
            <ClipBlock key={clip.id} track={t} clip={clip} />
          ))}
        </div>
      ))}
    </div>
  );
}
