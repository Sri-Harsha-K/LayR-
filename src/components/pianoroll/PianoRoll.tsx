import { useEffect, useRef, useState } from 'react';
import { pauseHistory, resumeHistory, useProjectStore } from '../../state/projectStore';
import { useUiStore } from '../../state/uiStore';
import { audioEngine } from '../../engine/AudioEngine';
import { TICKS_PER_BAR, TICKS_PER_BEAT } from '../../engine/time';
import { getTransientState } from '../../state/transient';
import { getDefaultPresetForEngine, getPresetByName, getPresetsForEngine } from '../../engine/instruments/synthPresets';
import type { Note, SynthEngine } from '../../state/types';
import { isBlackKey, isC, midiToNoteName } from '../../utils/pitch';
import {
  GRID_HEIGHT,
  KEYBOARD_WIDTH,
  PITCHES,
  ROW_HEIGHT,
  SNAP_OPTIONS,
  pitchToY,
  snapDown,
  snapNearest,
  tickToX,
  xToTick,
  yToPitch,
} from './geometry';

const ENGINES: SynthEngine[] = ['poly', 'fm', 'mono', 'pluck', 'duo'];

// Matches Pad.tsx's velocity-drag feel: 100px of vertical drag spans the
// full 0..1 range, floor of 0.05 so a note never drags silent-but-visible.
const DRAG_PIXELS_FOR_FULL_RANGE = 100;

type Gesture =
  | { mode: 'draw'; index: number; anchorTicks: number }
  | { mode: 'move'; index: number; grabOffsetTicks: number; durationTicks: number; lastPitch: number }
  | { mode: 'resize'; index: number; anchorTicks: number }
  | { mode: 'velocity'; index: number; startY: number; startVelocity: number };

export function PianoRoll() {
  const selection = useUiStore((s) => s.selection);
  const tracks = useProjectStore((s) => s.project.tracks);
  const updateClip = useProjectStore((s) => s.updateClip);
  const setTrackInstrument = useProjectStore((s) => s.setTrackInstrument);

  const [pxPerBeat, setPxPerBeat] = useState(96);
  const [snapIndex, setSnapIndex] = useState(4); // 1/16

  const gridRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);

  const track = tracks.find((t) => t.id === selection.trackId);
  const clip = track?.clips.find((c) => c.id === selection.clipId);
  const isMidiClip = !!track && track.kind === 'synth' && !!clip && clip.kind === 'midi';
  const notes = isMidiClip ? (clip as Extract<NonNullable<typeof clip>, { kind: 'midi' }>).notes : [];

  const pxPerTick = pxPerBeat / TICKS_PER_BEAT;
  const snapTicks = SNAP_OPTIONS[snapIndex]!.ticks;

  useEffect(() => {
    if (!isMidiClip || !clip) return;
    let raf: number;
    const loop = () => {
      const t = getTransientState();
      const el = playheadRef.current;
      if (el) {
        const local = t.playheadTicks - clip.startTicks;
        if (t.isPlaying && local >= 0 && local <= clip.lengthTicks) {
          el.style.display = 'block';
          el.style.transform = `translateX(${local * pxPerTick}px)`;
        } else {
          el.style.display = 'none';
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [isMidiClip, clip, pxPerTick]);

  if (!track || !clip || !isMidiClip) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-ink-faint">
        Select a MIDI clip to edit its notes.
      </div>
    );
  }

  const preview = (pitch: number) => audioEngine.previewSynthNote(track.id, pitch);

  const patchNotes = (next: Note[]) => updateClip(track.id, clip.id, { notes: next });

  const posFromEvent = (e: React.PointerEvent): { x: number; y: number } => {
    const rect = gridRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handleGridPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const { x, y } = posFromEvent(e);
    const pitch = yToPitch(y);
    const startTicks = Math.max(0, Math.min(snapDown(xToTick(x, pxPerTick), snapTicks), clip.lengthTicks - snapTicks));
    const index = notes.length;
    gridRef.current!.setPointerCapture(e.pointerId);
    pauseHistory();
    patchNotes([...notes, { pitch, startTicks, durationTicks: snapTicks, velocity: 0.8 }]);
    preview(pitch);
    gesture.current = { mode: 'draw', index, anchorTicks: startTicks };
  };

  const handleNotePointerDown = (
    e: React.PointerEvent,
    index: number,
    note: Note,
    mode: 'move' | 'resize' | 'velocity',
  ) => {
    e.stopPropagation();
    gridRef.current!.setPointerCapture(e.pointerId);
    pauseHistory();
    if (mode === 'resize') {
      gesture.current = { mode: 'resize', index, anchorTicks: note.startTicks };
    } else if (mode === 'velocity') {
      gesture.current = { mode: 'velocity', index, startY: e.clientY, startVelocity: note.velocity };
    } else {
      const { x } = posFromEvent(e);
      gesture.current = {
        mode: 'move',
        index,
        grabOffsetTicks: xToTick(x, pxPerTick) - note.startTicks,
        durationTicks: note.durationTicks,
        lastPitch: note.pitch,
      };
    }
  };

  const handleDeleteNote = (e: React.MouseEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    patchNotes(notes.filter((_, i) => i !== index));
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g) return;
    const { x, y } = posFromEvent(e);
    if (g.mode === 'draw') {
      const currentTick = snapNearest(xToTick(x, pxPerTick), snapTicks);
      const durationTicks = Math.max(snapTicks, currentTick - g.anchorTicks);
      patchNotes(notes.map((n, i) => (i === g.index ? { ...n, durationTicks } : n)));
    } else if (g.mode === 'move') {
      const rawStart = xToTick(x, pxPerTick) - g.grabOffsetTicks;
      const startTicks = Math.max(0, Math.min(snapNearest(rawStart, snapTicks), clip.lengthTicks - g.durationTicks));
      const pitch = yToPitch(y);
      patchNotes(notes.map((n, i) => (i === g.index ? { ...n, startTicks, pitch } : n)));
      if (pitch !== g.lastPitch) {
        preview(pitch);
        gesture.current = { ...g, lastPitch: pitch };
      }
    } else if (g.mode === 'resize') {
      const durationTicks = Math.max(snapTicks, snapNearest(xToTick(x, pxPerTick) - g.anchorTicks, snapTicks));
      patchNotes(notes.map((n, i) => (i === g.index ? { ...n, durationTicks } : n)));
    } else {
      const dy = g.startY - e.clientY;
      const velocity = Math.max(0.05, Math.min(1, g.startVelocity + dy / DRAG_PIXELS_FOR_FULL_RANGE));
      patchNotes(notes.map((n, i) => (i === g.index ? { ...n, velocity } : n)));
    }
  };

  const handlePointerUp = () => {
    if (gesture.current) resumeHistory();
    gesture.current = null;
  };

  const presetsForEngine = getPresetsForEngine(track.instrument!.engine);

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3 text-xs text-ink-dim">
        <label className="flex items-center gap-1">
          Engine
          <select
            value={track.instrument!.engine}
            onChange={(e) => setTrackInstrument(track.id, getDefaultPresetForEngine(e.target.value as SynthEngine))}
            className="rounded border border-hairline bg-surface-2 px-1 py-0.5 text-ink"
          >
            {ENGINES.map((eng) => (
              <option key={eng} value={eng}>
                {eng}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1">
          Preset
          <select
            value={track.instrument!.presetName}
            onChange={(e) => {
              const preset = getPresetByName(e.target.value);
              if (preset) setTrackInstrument(track.id, { ...preset, params: { ...preset.params } });
            }}
            className="rounded border border-hairline bg-surface-2 px-1 py-0.5 text-ink"
          >
            {presetsForEngine.map((p) => (
              <option key={p.presetName} value={p.presetName}>
                {p.presetName}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1">
          Snap
          <select
            value={snapIndex}
            onChange={(e) => setSnapIndex(Number(e.target.value))}
            className="rounded border border-hairline bg-surface-2 px-1 py-0.5 text-ink"
          >
            {SNAP_OPTIONS.map((s, i) => (
              <option key={s.label} value={i}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <span className="text-ink-faint">Right-click a note to delete</span>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => setPxPerBeat((z) => Math.max(24, z - 24))}
            className="h-5 w-5 rounded border border-hairline text-ink-faint hover:text-ink"
          >
            -
          </button>
          <span>Zoom</span>
          <button
            type="button"
            onClick={() => setPxPerBeat((z) => Math.min(320, z + 24))}
            className="h-5 w-5 rounded border border-hairline text-ink-faint hover:text-ink"
          >
            +
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-auto">
        <div className="sticky left-0 z-10 shrink-0" style={{ width: KEYBOARD_WIDTH }}>
          {PITCHES.map((p) => (
            <button
              key={p}
              type="button"
              onPointerDown={() => preview(p)}
              style={{ height: ROW_HEIGHT }}
              className={[
                'flex w-full items-center justify-end border-b border-hairline/40 pr-1 text-[9px] leading-none',
                isBlackKey(p) ? 'bg-surface-0 text-ink-faint' : 'bg-surface-2 text-ink-dim',
              ].join(' ')}
            >
              {isC(p) ? midiToNoteName(p) : ''}
            </button>
          ))}
        </div>

        <div
          ref={gridRef}
          className="relative touch-none"
          style={{ width: Math.max(1, clip.lengthTicks * pxPerTick), height: GRID_HEIGHT }}
          onPointerDown={handleGridPointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          {PITCHES.map((p) => (
            <div
              key={p}
              className="absolute inset-x-0 border-b border-hairline/30"
              style={{
                top: pitchToY(p),
                height: ROW_HEIGHT,
                backgroundColor: isBlackKey(p) ? 'rgba(0,0,0,0.12)' : 'transparent',
              }}
            />
          ))}

          {Array.from({ length: Math.ceil(clip.lengthTicks / TICKS_PER_BEAT) + 1 }, (_, beat) => (
            <div
              key={beat}
              className="absolute inset-y-0 border-l"
              style={{
                left: beat * TICKS_PER_BEAT * pxPerTick,
                borderColor:
                  (beat * TICKS_PER_BEAT) % TICKS_PER_BAR === 0
                    ? 'var(--color-hairline)'
                    : 'rgba(70,64,55,0.2)',
              }}
            />
          ))}

          {notes.map((note, index) => (
            <div
              key={index}
              onPointerDown={(e) => handleNotePointerDown(e, index, note, 'move')}
              onContextMenu={(e) => handleDeleteNote(e, index)}
              className="absolute rounded-sm"
              style={{
                left: tickToX(note.startTicks, pxPerTick),
                top: pitchToY(note.pitch) + 1,
                width: Math.max(4, tickToX(note.durationTicks, pxPerTick) - 1),
                height: ROW_HEIGHT - 2,
                backgroundColor: track.color,
                opacity: 0.35 + note.velocity * 0.65,
              }}
              title={`${midiToNoteName(note.pitch)} · drag to move, bottom edge for velocity (${Math.round(note.velocity * 100)}%), right edge to resize, right-click to delete`}
            >
              <div
                onPointerDown={(e) => handleNotePointerDown(e, index, note, 'velocity')}
                className="absolute inset-x-0 bottom-0 h-1 cursor-ns-resize"
              />
              <div
                onPointerDown={(e) => handleNotePointerDown(e, index, note, 'resize')}
                className="absolute right-0 top-0 h-full w-1.5 cursor-ew-resize"
              />
            </div>
          ))}

          <div
            ref={playheadRef}
            className="pointer-events-none absolute top-0 z-20 w-px bg-record"
            style={{ height: GRID_HEIGHT, display: 'none' }}
          />
        </div>
      </div>
    </div>
  );
}
