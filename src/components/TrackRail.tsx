import { useRef } from 'react';
import { pauseHistory, resumeHistory, useProjectStore } from '../state/projectStore';
import { useUiStore } from '../state/uiStore';
import type { Track } from '../state/types';
import { MiniToggle } from './MiniToggle';
import { ARRANGEMENT_HEADER_HEIGHT, TRACK_ROW_HEIGHT as ROW_HEIGHT } from './trackLayout';

function TrackHeaderRow({
  track,
  index,
  total,
  onDragHandlePointerDown,
}: {
  track: Track;
  index: number;
  total: number;
  onDragHandlePointerDown: (e: React.PointerEvent, index: number) => void;
}) {
  const updateMixer = useProjectStore((s) => s.updateTrackMixer);
  const setArmed = useProjectStore((s) => s.setTrackArmed);
  const reorderTracks = useProjectStore((s) => s.reorderTracks);
  const removeTrack = useProjectStore((s) => s.removeTrack);
  const selection = useUiStore((s) => s.selection);
  const selectTrack = useUiStore((s) => s.selectTrack);
  const selectClip = useUiStore((s) => s.selectClip);

  const isSelected = selection.trackId === track.id;

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    removeTrack(track.id);
    if (isSelected) selectClip(undefined, undefined);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => selectTrack(track.id)}
      onKeyDown={(e) => e.key === 'Enter' && selectTrack(track.id)}
      className={[
        'flex shrink-0 items-center gap-2 border-b border-hairline px-2 text-left',
        isSelected ? 'bg-surface-2' : 'hover:bg-surface-1',
      ].join(' ')}
      style={{ height: ROW_HEIGHT, borderLeft: `3px solid ${track.color}` }}
    >
      <button
        type="button"
        title="Drag to reorder"
        onPointerDown={(e) => onDragHandlePointerDown(e, index)}
        onClick={(e) => e.stopPropagation()}
        className="touch-none cursor-grab self-stretch px-0.5 text-ink-faint hover:text-ink active:cursor-grabbing"
      >
        ⋮⋮
      </button>
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
        <div className="flex flex-col">
          <button
            type="button"
            title="Move up"
            disabled={index === 0}
            onClick={(e) => {
              e.stopPropagation();
              reorderTracks(index, index - 1);
            }}
            className="h-2.5 w-4 text-[8px] leading-none text-ink-faint hover:text-ink disabled:opacity-30"
          >
            ▲
          </button>
          <button
            type="button"
            title="Move down"
            disabled={index === total - 1}
            onClick={(e) => {
              e.stopPropagation();
              reorderTracks(index, index + 1);
            }}
            className="h-2.5 w-4 text-[8px] leading-none text-ink-faint hover:text-ink disabled:opacity-30"
          >
            ▼
          </button>
        </div>
        <button
          type="button"
          title="Delete track"
          onClick={handleRemove}
          className="h-5 w-5 text-[10px] leading-none text-ink-faint hover:text-record"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

export function TrackRail() {
  const tracks = useProjectStore((s) => s.project.tracks);
  const addTrack = useProjectStore((s) => s.addTrack);
  const addDefaultPatternClip = useProjectStore((s) => s.addDefaultPatternClip);
  const addDefaultMidiClip = useProjectStore((s) => s.addDefaultMidiClip);
  const reorderTracks = useProjectStore((s) => s.reorderTracks);
  const selectClip = useUiStore((s) => s.selectClip);
  const setBottomPanelTab = useUiStore((s) => s.setBottomPanelTab);

  const rowsRef = useRef<HTMLDivElement>(null);
  const dragFromIndex = useRef<number | null>(null);

  const handleAddDrumTrack = () => {
    const trackId = addTrack('drum');
    const clipId = addDefaultPatternClip(trackId);
    selectClip(trackId, clipId);
    setBottomPanelTab('stepsequencer');
  };

  const handleAddSynthTrack = () => {
    const trackId = addTrack('synth');
    const clipId = addDefaultMidiClip(trackId);
    selectClip(trackId, clipId);
    setBottomPanelTab('pianoroll');
  };

  const handleDragHandlePointerDown = (e: React.PointerEvent, index: number) => {
    // Capture on the rows container (not the handle) so pointermove/up keep
    // firing here regardless of which row the pointer ends up over — same
    // "one pointer-event model on a container" pattern ArrangementView uses
    // for clip drags.
    rowsRef.current!.setPointerCapture(e.pointerId);
    pauseHistory();
    dragFromIndex.current = index;
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const fromIndex = dragFromIndex.current;
    if (fromIndex === null) return;
    const rect = rowsRef.current!.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const toIndex = Math.max(0, Math.min(tracks.length - 1, Math.floor(y / ROW_HEIGHT)));
    if (toIndex !== fromIndex) {
      reorderTracks(fromIndex, toIndex);
      dragFromIndex.current = toIndex;
    }
  };

  const handlePointerUp = () => {
    if (dragFromIndex.current !== null) resumeHistory();
    dragFromIndex.current = null;
  };

  return (
    <aside className="flex w-56 shrink-0 flex-col overflow-y-auto border-r border-hairline bg-surface-1">
      {/* Reserves the same vertical space as ArrangementView's toolbar+ruler
          header, so track row 0 here lines up with track lane 0 there. */}
      <div className="shrink-0 border-b border-hairline bg-surface-1" style={{ height: ARRANGEMENT_HEADER_HEIGHT }} />
      <div
        ref={rowsRef}
        className="flex flex-col"
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {tracks.map((t, index) => (
          <TrackHeaderRow
            key={t.id}
            track={t}
            index={index}
            total={tracks.length}
            onDragHandlePointerDown={handleDragHandlePointerDown}
          />
        ))}
      </div>
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
          onClick={handleAddSynthTrack}
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
