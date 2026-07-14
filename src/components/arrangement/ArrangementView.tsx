import { useEffect, useRef, useState } from 'react';
import { furthestClipEndTicks, nextClipName, pauseHistory, resumeHistory, useProjectStore } from '../../state/projectStore';
import { useUiStore } from '../../state/uiStore';
import { getTransientState } from '../../state/transient';
import { audioEngine } from '../../engine/AudioEngine';
import { sampleVolumeAtTick, sortKeyframes } from '../../engine/automation';
import { TICKS_PER_BAR, TICKS_PER_BEAT, secondsToTicks } from '../../engine/time';
import { clampSpeed, DEFAULT_SPEED } from '../../engine/speed';
import { SNAP_OPTIONS, snapNearest, tickToX, xToTick } from '../pianoroll/geometry';
import { ARRANGEMENT_TOOLBAR_HEIGHT, TRACK_ROW_HEIGHT as ROW_HEIGHT } from '../trackLayout';
import { generateId } from '../../utils/id';
import { SAMPLE_DRAG_MIME, type SampleDragPayload } from '../../utils/dragTypes';
import { StartScreen } from '../StartScreen';
import type { Clip, Track } from '../../state/types';

const DEFAULT_SNAP_INDEX = 2; // 1/4 (one beat) — see SNAP_OPTIONS

// Must match ClipBlock's `top-1 bottom-1` padding below (0.25rem = 4px at
// the default root font size) — the volume-keyframe overlay's coordinate
// space is the clip's padded content box, not its full row height.
const CLIP_VPAD = 4;
const CLIP_CONTENT_HEIGHT = ROW_HEIGHT - CLIP_VPAD * 2;

function valueFromLocalY(y: number): number {
  return Math.max(0, Math.min(1, 1 - y / CLIP_CONTENT_HEIGHT));
}

function clipLabel(clip: Clip): string {
  if (clip.name) return clip.name;
  if (clip.kind === 'pattern') return 'Pattern';
  if (clip.kind === 'midi') return 'MIDI';
  return 'Audio';
}

// How many pixels of Ctrl/Cmd+drag on the resize handle change speed by 1x.
// Additive-linear (not exponential) so the mapping is predictable both ways;
// clampSpeed bounds the result to MIN..MAX regardless of drag distance.
const SPEED_DRAG_PX_PER_UNIT = 120;

/** Trims trailing zeros so 1.5 shows as "1.5×" and 2 as "2×", not "2.00×". */
function formatSpeed(speed: number): string {
  return `${Number(speed.toFixed(2))}×`;
}

const SPLINE_SAMPLE_STEP_PX = 3;

/** Points for the clip's volume-curve overlay. 'linear' draws exact straight segments between keyframes (cheap, exact); 'spline' samples the same Catmull-Rom math the engine actually plays at a fine pixel step, so the drawn curve matches what you hear. */
function curvePoints(
  sorted: { ticks: number; value: number }[],
  curve: 'linear' | 'spline' | undefined,
  widthPx: number,
  pxPerTick: number,
): [number, number][] {
  if (curve !== 'spline') {
    return [
      [0, (1 - sorted[0]!.value) * CLIP_CONTENT_HEIGHT],
      ...sorted.map((k): [number, number] => [tickToX(k.ticks, pxPerTick), (1 - k.value) * CLIP_CONTENT_HEIGHT]),
      [widthPx, (1 - sorted[sorted.length - 1]!.value) * CLIP_CONTENT_HEIGHT],
    ];
  }
  const points: [number, number][] = [];
  for (let x = 0; x <= widthPx; x += SPLINE_SAMPLE_STEP_PX) {
    const value = sampleVolumeAtTick(sorted, xToTick(x, pxPerTick), 'spline');
    points.push([x, (1 - value) * CLIP_CONTENT_HEIGHT]);
  }
  return points;
}

type Gesture =
  | {
      mode: 'move';
      clipId: string;
      sourceKind: Track['kind'];
      currentTrackId: string;
      grabOffsetTicks: number;
    }
  | { mode: 'resize'; clipId: string; trackId: string; anchorTicks: number }
  | { mode: 'speed'; clipId: string; trackId: string; anchorX: number; startSpeed: number }
  | { mode: 'automation'; clipId: string; trackId: string; kfIndex: number };

function Ruler({
  contentWidthTicks,
  pxPerTick,
  snapTicks,
  loopEnabled,
  loopStartTicks,
  loopEndTicks,
  setLoopRange,
}: {
  contentWidthTicks: number;
  pxPerTick: number;
  snapTicks: number;
  loopEnabled: boolean;
  loopStartTicks: number;
  loopEndTicks: number;
  setLoopRange: (start: number, end: number) => void;
}) {
  const rulerRef = useRef<HTMLDivElement>(null);
  // Plain drag scrubs the playhead (most common ruler gesture in any DAW);
  // Shift+drag sets the loop range instead — same ruler, modifier picks
  // which of the two the drag means.
  const dragMode = useRef<'scrub' | 'loop' | null>(null);
  const dragAnchorTicks = useRef<number>(0);

  const tickAt = (e: React.PointerEvent): number => {
    const rect = rulerRef.current!.getBoundingClientRect();
    return Math.max(0, snapNearest(xToTick(e.clientX - rect.left, pxPerTick), snapTicks));
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    rulerRef.current!.setPointerCapture(e.pointerId);
    const tick = tickAt(e);
    if (e.shiftKey) {
      dragMode.current = 'loop';
      dragAnchorTicks.current = tick;
      setLoopRange(tick, tick + snapTicks);
    } else {
      dragMode.current = 'scrub';
      audioEngine.seekTo(tick);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragMode.current === null) return;
    const tick = tickAt(e);
    if (dragMode.current === 'scrub') {
      audioEngine.seekTo(tick);
      return;
    }
    const start = Math.min(dragAnchorTicks.current, tick);
    const end = Math.max(dragAnchorTicks.current, tick);
    setLoopRange(start, Math.max(end, start + snapTicks));
  };

  const handlePointerUp = () => {
    dragMode.current = null;
  };

  const barCount = Math.ceil(contentWidthTicks / TICKS_PER_BAR) + 1;

  return (
    <div
      ref={rulerRef}
      className="sticky top-0 z-10 h-6 touch-none select-none border-b border-hairline bg-surface-1"
      style={{ width: contentWidthTicks * pxPerTick }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      title="Drag to move the playhead — Shift+drag to set the loop range"
    >
      {loopEnabled && (
        <div
          className="pointer-events-none absolute inset-y-0 bg-accent/25"
          style={{
            left: loopStartTicks * pxPerTick,
            width: Math.max(2, (loopEndTicks - loopStartTicks) * pxPerTick),
          }}
        />
      )}
      {Array.from({ length: barCount }, (_, bar) => (
        <div
          key={bar}
          className="pointer-events-none absolute top-0 h-full border-l border-hairline/60 pl-1 text-[10px] leading-6 text-ink-faint"
          style={{ left: bar * TICKS_PER_BAR * pxPerTick }}
        >
          {bar + 1}
        </div>
      ))}
    </div>
  );
}

function PlayheadLine({ pxPerTick }: { pxPerTick: number }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf: number;
    const loop = () => {
      const el = ref.current;
      // Always shown (not just while playing) so a scrub's landing position
      // is visible — matches TimeDisplay's own readout, which likewise
      // always reflects position regardless of transport state.
      if (el) el.style.transform = `translateX(${getTransientState().playheadTicks * pxPerTick}px)`;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [pxPerTick]);

  return <div ref={ref} className="pointer-events-none absolute top-0 z-20 w-px bg-record" style={{ height: '100%' }} />;
}

function ClipBlock({
  track,
  clip,
  pxPerTick,
  isSelected,
  onPointerDownMove,
  onPointerDownResize,
  onPointerDownKeyframe,
  onDeleteKeyframe,
  onContextMenu,
}: {
  track: Track;
  clip: Clip;
  pxPerTick: number;
  isSelected: boolean;
  onPointerDownMove: (e: React.PointerEvent, track: Track, clip: Clip) => void;
  onPointerDownResize: (e: React.PointerEvent, track: Track, clip: Clip) => void;
  onPointerDownKeyframe: (e: React.PointerEvent, track: Track, clip: Clip, index: number) => void;
  onDeleteKeyframe: (track: Track, clip: Clip, index: number) => void;
  onContextMenu: (e: React.MouseEvent, track: Track, clip: Clip) => void;
}) {
  const widthPx = Math.max(24, tickToX(clip.lengthTicks, pxPerTick));
  // Dots are rendered/indexed in the clip's own (insertion) order, not
  // ticks order, so a dot's index always matches its index in
  // `clip.volumeKeyframes` — the gesture that drags a dot captures that
  // index once at pointerdown and reuses it on every pointermove (same
  // "no id, index is stable for one gesture" convention PianoRoll's notes
  // use). Only the drawn curve needs ticks order, via a separate sorted copy.
  const keyframes = clip.volumeKeyframes ?? [];
  const sortedForLine = sortKeyframes(keyframes);

  return (
    <div
      onPointerDown={(e) => onPointerDownMove(e, track, clip)}
      onContextMenu={(e) => onContextMenu(e, track, clip)}
      className={[
        'absolute top-1 bottom-1 flex cursor-grab touch-none items-center justify-start overflow-hidden rounded px-2 text-left text-xs active:cursor-grabbing',
        isSelected ? 'ring-2 ring-accent' : '',
      ].join(' ')}
      style={{
        left: tickToX(clip.startTicks, pxPerTick),
        width: widthPx,
        backgroundColor: `${track.color}33`,
        borderLeft: `2px solid ${track.color}`,
        color: 'var(--color-ink)',
      }}
      title={`${clipLabel(clip)} clip — drag to move (drop on a same-kind track to retarget), right edge to resize (Ctrl/Cmd+drag it to change speed), double-click to add a volume point, right-click for instrument & effects`}
    >
      {clipLabel(clip)}
      {clip.speed !== undefined && clip.speed !== DEFAULT_SPEED && (
        <span className="ml-1.5 shrink-0 rounded-sm bg-surface-0/70 px-1 text-[10px] leading-tight text-accent">
          {formatSpeed(clip.speed)}
        </span>
      )}
      {sortedForLine.length > 0 && (
        <svg
          className="pointer-events-none absolute inset-0"
          width={widthPx}
          height={CLIP_CONTENT_HEIGHT}
        >
          <polyline
            points={curvePoints(sortedForLine, clip.volumeCurve, widthPx, pxPerTick)
              .map(([x, y]) => `${x},${y}`)
              .join(' ')}
            fill="none"
            stroke="var(--color-ink)"
            strokeWidth={1.5}
            opacity={0.8}
          />
        </svg>
      )}
      {keyframes.map((kf, i) => (
        <div
          key={i}
          onPointerDown={(e) => onPointerDownKeyframe(e, track, clip, i)}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDeleteKeyframe(track, clip, i);
          }}
          className="absolute z-10 h-2 w-2 -translate-x-1 -translate-y-1 cursor-ns-resize rounded-full border border-surface-0"
          style={{
            left: tickToX(kf.ticks, pxPerTick),
            top: (1 - kf.value) * CLIP_CONTENT_HEIGHT,
            backgroundColor: 'var(--color-ink)',
          }}
          title={`Volume ${Math.round(kf.value * 100)}% — drag to adjust, right-click to delete`}
        />
      ))}
      <div
        onPointerDown={(e) => onPointerDownResize(e, track, clip)}
        className="absolute right-0 top-0 h-full w-1.5 cursor-ew-resize"
        title="Drag to resize · Ctrl/Cmd+drag to change playback speed"
      />
    </div>
  );
}

export function ArrangementView() {
  const tracks = useProjectStore((s) => s.project.tracks);
  const updateClip = useProjectStore((s) => s.updateClip);
  const moveClipToTrack = useProjectStore((s) => s.moveClipToTrack);
  const addClip = useProjectStore((s) => s.addClip);
  const selection = useUiStore((s) => s.selection);
  const selectClip = useUiStore((s) => s.selectClip);
  const setBottomPanelTab = useUiStore((s) => s.setBottomPanelTab);
  const pxPerBeat = useUiStore((s) => s.pxPerBeat);
  const setPxPerBeat = useUiStore((s) => s.setPxPerBeat);
  const loopEnabled = useUiStore((s) => s.loopEnabled);
  const loopStartTicks = useUiStore((s) => s.loopStartTicks);
  const loopEndTicks = useUiStore((s) => s.loopEndTicks);
  const setLoopRange = useUiStore((s) => s.setLoopRange);

  const [snapIndex, setSnapIndex] = useState(DEFAULT_SNAP_INDEX);

  const tracksAreaRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  // Native dblclick can't be used here: setPointerCapture on tracksAreaRef
  // (below) retargets the browser's derived click/dblclick events to the
  // capturing element too, so a clip's own onDoubleClick handler never
  // fires once a gesture has captured the pointer once. Detected manually
  // instead, off the same pointerdown stream everything else already goes
  // through — same "one pointer-event model" convention this file already
  // uses for move/resize/automation.
  const lastClipPointerDown = useRef<{ clipId: string; time: number; x: number; y: number } | null>(null);
  const DOUBLE_CLICK_MS = 400;
  const DOUBLE_CLICK_SLOP_PX = 6;

  const pxPerTick = pxPerBeat / TICKS_PER_BEAT;
  const snapTicks = SNAP_OPTIONS[snapIndex]!.ticks;

  if (tracks.length === 0) {
    return <StartScreen />;
  }

  const contentWidthTicks = Math.max(furthestClipEndTicks(tracks) + TICKS_PER_BAR * 4, TICKS_PER_BAR * 16);

  const selectAndFocus = (track: Track, clip: Clip) => {
    selectClip(track.id, clip.id);
    setBottomPanelTab(clip.kind === 'pattern' ? 'stepsequencer' : clip.kind === 'midi' ? 'pianoroll' : 'mixer');
  };

  const addVolumeKeyframeAt = (track: Track, clip: Clip, clientX: number, clientY: number) => {
    const rect = tracksAreaRef.current!.getBoundingClientRect();
    const trackIndex = tracks.indexOf(track);
    const x = clientX - rect.left;
    const y = clientY - rect.top - trackIndex * ROW_HEIGHT - CLIP_VPAD;
    const ticks = Math.max(
      0,
      Math.min(clip.lengthTicks, snapNearest(xToTick(x, pxPerTick) - clip.startTicks, snapTicks)),
    );
    const value = valueFromLocalY(y);
    updateClip(track.id, clip.id, { volumeKeyframes: [...(clip.volumeKeyframes ?? []), { ticks, value }] });
  };

  const handleClipPointerDownMove = (e: React.PointerEvent, track: Track, clip: Clip) => {
    e.stopPropagation();

    const rect = tracksAreaRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const last = lastClipPointerDown.current;
    const isDoubleClick =
      !!last &&
      last.clipId === clip.id &&
      e.timeStamp - last.time < DOUBLE_CLICK_MS &&
      Math.abs(x - last.x) < DOUBLE_CLICK_SLOP_PX &&
      Math.abs(y - last.y) < DOUBLE_CLICK_SLOP_PX;
    // Consume on recognition so a third rapid click starts a fresh pair
    // rather than adding a keyframe on every click after the second.
    lastClipPointerDown.current = isDoubleClick ? null : { clipId: clip.id, time: e.timeStamp, x, y };

    if (isDoubleClick) {
      selectAndFocus(track, clip);
      addVolumeKeyframeAt(track, clip, e.clientX, e.clientY);
      return;
    }

    tracksAreaRef.current!.setPointerCapture(e.pointerId);
    pauseHistory();
    selectAndFocus(track, clip);
    gesture.current = {
      mode: 'move',
      clipId: clip.id,
      sourceKind: track.kind,
      currentTrackId: track.id,
      grabOffsetTicks: xToTick(x, pxPerTick) - clip.startTicks,
    };
  };

  const handleClipPointerDownResize = (e: React.PointerEvent, track: Track, clip: Clip) => {
    e.stopPropagation();
    tracksAreaRef.current!.setPointerCapture(e.pointerId);
    pauseHistory();
    selectAndFocus(track, clip);
    // Same handle, modifier picks the meaning: plain drag resizes the clip's
    // arrangement length; Ctrl/Cmd+drag changes its playback-speed multiplier
    // (see ClipBase.speed) without touching its footprint.
    if (e.ctrlKey || e.metaKey) {
      const rect = tracksAreaRef.current!.getBoundingClientRect();
      gesture.current = {
        mode: 'speed',
        clipId: clip.id,
        trackId: track.id,
        anchorX: e.clientX - rect.left,
        startSpeed: clip.speed ?? DEFAULT_SPEED,
      };
      return;
    }
    gesture.current = { mode: 'resize', clipId: clip.id, trackId: track.id, anchorTicks: clip.startTicks };
  };

  const handleClipPointerDownKeyframe = (e: React.PointerEvent, track: Track, clip: Clip, index: number) => {
    e.stopPropagation();
    tracksAreaRef.current!.setPointerCapture(e.pointerId);
    pauseHistory();
    selectAndFocus(track, clip);
    gesture.current = { mode: 'automation', clipId: clip.id, trackId: track.id, kfIndex: index };
  };

  const handleClipContextMenu = (e: React.MouseEvent, track: Track, clip: Clip) => {
    e.preventDefault();
    e.stopPropagation();
    selectClip(track.id, clip.id);
    setBottomPanelTab('sound');
  };

  // Library samples only drop onto audio tracks — a drum/synth track's clips
  // are pattern/MIDI content, not decoded audio, so there's nothing sensible
  // for a dropped sample to become there (the Library tab's per-lane sample
  // load path already covers drum lanes).
  const handleTrackDrop = (e: React.DragEvent, track: Track) => {
    if (track.kind !== 'audio') return;
    const raw = e.dataTransfer.getData(SAMPLE_DRAG_MIME);
    if (!raw) return;
    e.preventDefault();
    const payload = JSON.parse(raw) as SampleDragPayload;
    const rect = tracksAreaRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const startTicks = Math.max(0, snapNearest(xToTick(x, pxPerTick), snapTicks));
    const bpm = useProjectStore.getState().project.bpm;
    const lengthTicks = Math.max(1, Math.round(secondsToTicks(payload.durationSeconds, bpm)));
    const clip: Clip = {
      id: generateId('clip'),
      startTicks,
      lengthTicks,
      name: nextClipName(track, 'audio', payload.name),
      kind: 'audio',
      fileRef: payload.ref,
      bufferOffsetSec: 0,
      gainDb: 0,
    };
    addClip(track.id, clip);
  };

  const handleDeleteKeyframe = (track: Track, clip: Clip, index: number) => {
    updateClip(track.id, clip.id, {
      volumeKeyframes: (clip.volumeKeyframes ?? []).filter((_, i) => i !== index),
    });
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g) return;
    const rect = tracksAreaRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (g.mode === 'resize') {
      const newLength = Math.max(snapTicks, snapNearest(xToTick(x, pxPerTick) - g.anchorTicks, snapTicks));
      updateClip(g.trackId, g.clipId, { lengthTicks: newLength });
      return;
    }

    if (g.mode === 'speed') {
      const speed = clampSpeed(g.startSpeed + (x - g.anchorX) / SPEED_DRAG_PX_PER_UNIT);
      updateClip(g.trackId, g.clipId, { speed });
      return;
    }

    if (g.mode === 'automation') {
      const track = tracks.find((t) => t.id === g.trackId);
      const clip = track?.clips.find((c) => c.id === g.clipId);
      if (!track || !clip) return;
      const trackIndex = tracks.indexOf(track);
      const ticks = Math.max(
        0,
        Math.min(clip.lengthTicks, snapNearest(xToTick(x, pxPerTick) - clip.startTicks, snapTicks)),
      );
      const value = valueFromLocalY(y - trackIndex * ROW_HEIGHT - CLIP_VPAD);
      const next = (clip.volumeKeyframes ?? []).map((kf, i) => (i === g.kfIndex ? { ticks, value } : kf));
      updateClip(track.id, clip.id, { volumeKeyframes: next });
      return;
    }

    const startTicks = Math.max(0, snapNearest(xToTick(x, pxPerTick) - g.grabOffsetTicks, snapTicks));
    const rowIndex = Math.max(0, Math.min(tracks.length - 1, Math.floor(y / ROW_HEIGHT)));
    const hovered = tracks[rowIndex];
    // Only retarget onto a track of the same kind (pattern->drum, midi->synth,
    // audio->audio) — a clip's shape is tied to its track's kind, so a
    // cross-kind drop just stays on the clip's current track.
    const nextTrackId = hovered && hovered.kind === g.sourceKind ? hovered.id : g.currentTrackId;
    moveClipToTrack(g.currentTrackId, nextTrackId, g.clipId, { startTicks });
    gesture.current = { ...g, currentTrackId: nextTrackId };
  };

  const handlePointerUp = () => {
    if (gesture.current) resumeHistory();
    gesture.current = null;
  };

  return (
    <div className="flex h-full flex-col">
      <div
        className="flex items-center gap-3 border-b border-hairline bg-surface-1 px-3 text-xs text-ink-dim"
        style={{ height: ARRANGEMENT_TOOLBAR_HEIGHT }}
      >
        <label className="label-mono flex items-center gap-1 text-ink-faint">
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
        <span className="text-ink-faint">
          Drag a clip to move · right edge to resize (Ctrl/Cmd+drag it for playback speed) · Delete to remove ·
          Ctrl/Cmd+D to duplicate · X to split at playhead · double-click a clip for a volume point, drag a point to
          adjust, right-click a point to delete · right-click a clip for instrument &amp; effects
        </span>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => setPxPerBeat(pxPerBeat - 8)}
            className="h-5 w-5 rounded border border-hairline text-ink-faint hover:text-ink"
          >
            -
          </button>
          <span className="label-mono text-ink-faint">Zoom</span>
          <button
            type="button"
            onClick={() => setPxPerBeat(pxPerBeat + 8)}
            className="h-5 w-5 rounded border border-hairline text-ink-faint hover:text-ink"
          >
            +
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div style={{ width: contentWidthTicks * pxPerTick }}>
          <Ruler
            contentWidthTicks={contentWidthTicks}
            pxPerTick={pxPerTick}
            snapTicks={snapTicks}
            loopEnabled={loopEnabled}
            loopStartTicks={loopStartTicks}
            loopEndTicks={loopEndTicks}
            setLoopRange={setLoopRange}
          />
          <div
            ref={tracksAreaRef}
            className="relative"
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            {tracks.map((t) => (
              <div
                key={t.id}
                className="relative border-b border-hairline"
                style={{ height: ROW_HEIGHT }}
                onDragOver={(e) => {
                  if (t.kind === 'audio') e.preventDefault();
                }}
                onDrop={(e) => handleTrackDrop(e, t)}
              >
                {t.clips.map((clip) => (
                  <ClipBlock
                    key={clip.id}
                    track={t}
                    clip={clip}
                    pxPerTick={pxPerTick}
                    isSelected={selection.trackId === t.id && selection.clipId === clip.id}
                    onPointerDownMove={handleClipPointerDownMove}
                    onPointerDownResize={handleClipPointerDownResize}
                    onPointerDownKeyframe={handleClipPointerDownKeyframe}
                    onDeleteKeyframe={handleDeleteKeyframe}
                    onContextMenu={handleClipContextMenu}
                  />
                ))}
              </div>
            ))}
            <PlayheadLine pxPerTick={pxPerTick} />
          </div>
        </div>
      </div>
    </div>
  );
}
