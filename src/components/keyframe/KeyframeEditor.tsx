// A dedicated curve editor, docked to the right of the Step Sequencer (pattern
// clips) and Piano Roll (MIDI clips). A dropdown picks the channel it edits:
//
//   • Volume — clip.volumeKeyframes / volumeCurve (0..1 gain). Scales each
//     hit's/note's velocity across the bar.
//   • Speed  — clip.speedKeyframes / speedCurve (MIN..MAX speed). Retimes the
//     bar via engine/speedAutomation.ts's time-warp — the events bunch where
//     the curve is fast and spread where it's slow.
//
// Both are the exact same {ticks, value} data the engine already consumes, so
// this is purely an editing surface. The plot's horizontal span IS the bar:
// x=0 -> the clip's start (tick 0), x=full -> its end (clip.lengthTicks).
// Keyframe ticks are stored clip-relative already, so the mapping is a direct
// ratio with no offset. This editor only ever mounts for pattern/MIDI clips,
// which is exactly where a speed *curve* is well-defined (audio has no
// per-event retiming, only a scalar playbackRate).
import { useCallback, useRef, useState } from 'react';
import { pauseHistory, resumeHistory, useProjectStore } from '../../state/projectStore';
import { useUiStore } from '../../state/uiStore';
import { effectiveHandles, sampleCurveAtTick, sortKeyframes } from '../../engine/automation';
import { MAX_SPEED, MIN_SPEED } from '../../engine/speed';
import { TICKS_PER_BEAT } from '../../engine/time';
import type { VolumeKeyframe } from '../../state/types';

const RAIL_WIDTH = 252;
// Inset must exceed the handle radius (dot is 12px -> r=6) so a keyframe at an
// extreme (tick 0 / value 0 / value 1) sits fully inside the plot instead of
// spilling onto the border. The plot's pixel size is MEASURED at runtime (it
// flexes to fill the dock height, which the user can drag-resize) rather than
// hardcoded — a fixed height would mismatch the flex-shrunk box and clip a
// handle under overflow-hidden.
const PLOT_PAD = 16;
const MIN_PLOT_H = 90;
const SPLINE_STEP_PX = 3;
const DOUBLE_CLICK_MS = 400;
const DOUBLE_CLICK_SLOP_PX = 6;

type Channel = 'volume' | 'speed';

export function KeyframeEditor({ expectKind }: { expectKind: 'pattern' | 'midi' }) {
  const selection = useUiStore((s) => s.selection);
  const tracks = useProjectStore((s) => s.project.tracks);
  const updateClip = useProjectStore((s) => s.updateClip);

  // All hooks above the early return so hook order stays stable across the
  // "no clip selected" and "clip selected" renders.
  const [channel, setChannel] = useState<Channel>('volume');
  const [dims, setDims] = useState({ w: 0, h: 0 });
  const plotRef = useRef<HTMLDivElement | null>(null);
  const roRef = useRef<ResizeObserver | null>(null);
  // A gesture is dragging either a keyframe point or one of its bezier tangent
  // handle ends; `index` is the keyframe's index in displayKeyframes.
  const drag = useRef<{ kind: 'point' | 'in' | 'out'; index: number } | null>(null);
  const lastDown = useRef<{ time: number; x: number; y: number } | null>(null);

  // Callback ref: measure the plot on mount and on every resize (dock-height
  // drag, window resize) so tx/vy map to the box's real pixels. Re-attaches
  // whenever the plot mounts/unmounts (e.g. selecting a clip after the empty
  // state), which a plain useEffect with [] deps would miss.
  const setPlotEl = useCallback((el: HTMLDivElement | null) => {
    roRef.current?.disconnect();
    plotRef.current = el;
    if (!el) return;
    const measure = () =>
      setDims((prev) => (prev.w === el.clientWidth && prev.h === el.clientHeight ? prev : { w: el.clientWidth, h: el.clientHeight }));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    roRef.current = ro;
  }, []);

  const track = tracks.find((t) => t.id === selection.trackId);
  const clip = track?.clips.find((c) => c.id === selection.clipId);
  const kindLabel = expectKind === 'pattern' ? 'pattern' : 'MIDI';

  if (!track || !clip || clip.kind !== expectKind) {
    return (
      <aside className="flex shrink-0 flex-col border-l border-hairline pl-3" style={{ width: RAIL_WIDTH }}>
        <span className="label-mono mb-2 text-ink-faint">Keyframes</span>
        <div className="flex flex-1 items-center justify-center text-center text-xs text-ink-faint">
          Select a {kindLabel} clip to shape its volume or speed across the bar.
        </div>
      </aside>
    );
  }

  // Per-channel config: which fields to read/write, the value axis bounds, the
  // flat-default value, the readout format, and the reference gridlines.
  const cfg =
    channel === 'volume'
      ? {
          keyframes: clip.volumeKeyframes ?? [],
          curve: clip.volumeCurve ?? 'linear',
          min: 0,
          max: 1,
          def: 1,
          gridValues: [0, 0.5, 1],
          format: (v: number) => `${Math.round(v * 100)}%`,
          scaledWhat: expectKind === 'pattern' ? 'hit' : 'note',
        }
      : {
          keyframes: clip.speedKeyframes ?? [],
          curve: clip.speedCurve ?? 'linear',
          min: MIN_SPEED,
          max: MAX_SPEED,
          def: 1,
          gridValues: [MIN_SPEED, 1, MAX_SPEED],
          format: (v: number) => `${Number(v.toFixed(2))}×`,
          scaledWhat: 'bar',
        };

  const keyframes = cfg.keyframes;
  const curve = cfg.curve;
  const lengthTicks = Math.max(1, clip.lengthTicks);

  // With no real keyframes yet, show two draggable handles at the bar's start
  // and end (at the channel's default value) so there's always something to
  // grab — the flat line you see IS these two points. They're display-only
  // until the first edit, which commits them (plus any change) as real
  // keyframes; opening the panel never dirties the project on its own.
  const hasReal = keyframes.length > 0;
  const displayKeyframes: VolumeKeyframe[] = hasReal
    ? keyframes
    : [
        { ticks: 0, value: cfg.def },
        { ticks: lengthTicks, value: cfg.def },
      ];

  const setKeyframes = (next: VolumeKeyframe[]) => {
    updateClip(track.id, clip.id, channel === 'volume' ? { volumeKeyframes: next } : { speedKeyframes: next });
  };
  const setCurve = (c: 'linear' | 'spline') => {
    updateClip(track.id, clip.id, channel === 'volume' ? { volumeCurve: c } : { speedCurve: c });
  };

  const innerW = Math.max(1, dims.w - PLOT_PAD * 2);
  const innerH = Math.max(1, dims.h - PLOT_PAD * 2);
  const ready = dims.w > 1 && dims.h > 1;
  const tx = (ticks: number) => PLOT_PAD + (ticks / lengthTicks) * innerW;
  const vy = (value: number) => PLOT_PAD + (1 - (value - cfg.min) / (cfg.max - cfg.min)) * innerH;
  const toTick = (x: number) => Math.max(0, Math.min(lengthTicks, ((x - PLOT_PAD) / innerW) * lengthTicks));
  const toValue = (y: number) =>
    Math.max(cfg.min, Math.min(cfg.max, cfg.min + (1 - (y - PLOT_PAD) / innerH) * (cfg.max - cfg.min)));

  const localXY = (e: React.PointerEvent | React.MouseEvent) => {
    const rect = plotRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  // Vertical beat guides anchor the plot to the bar (4 for a 1-bar clip).
  const beatLines: number[] = [];
  for (let t = 0; t <= lengthTicks; t += TICKS_PER_BEAT) beatLines.push(t);

  // Bezier tangent handles (spline only). Computed on a ticks-sorted view so a
  // handle's default slope uses the correct neighbors, but each entry keeps the
  // keyframe's ORIGINAL displayKeyframes index so a drag maps back to storage
  // order. Handle-end positions are clamped into the plot so a steep default
  // tangent still stays grabbable on screen.
  const clampX = (t: number) => Math.max(0, Math.min(lengthTicks, t));
  const clampV = (v: number) => Math.max(cfg.min, Math.min(cfg.max, v));
  const handleEnds: { index: number; which: 'in' | 'out'; px: number; py: number; ex: number; ey: number }[] = [];
  if (curve === 'spline' && ready) {
    const withIdx = displayKeyframes.map((kf, idx) => ({ kf, idx })).sort((a, b) => a.kf.ticks - b.kf.ticks);
    const sortedKfs = withIdx.map((w) => w.kf);
    withIdx.forEach(({ kf, idx }, j) => {
      const { inH, outH } = effectiveHandles(sortedKfs, j);
      const px = tx(kf.ticks);
      const py = vy(kf.value);
      if (j > 0) handleEnds.push({ index: idx, which: 'in', px, py, ex: tx(clampX(kf.ticks + inH.dticks)), ey: vy(clampV(kf.value + inH.dvalue)) });
      if (j < sortedKfs.length - 1) handleEnds.push({ index: idx, which: 'out', px, py, ex: tx(clampX(kf.ticks + outH.dticks)), ey: vy(clampV(kf.value + outH.dvalue)) });
    });
  }

  const curvePoints = (): string => {
    const sorted = sortKeyframes(displayKeyframes);
    if (curve === 'spline') {
      const pts: string[] = [];
      for (let px = 0; px <= innerW; px += SPLINE_STEP_PX) {
        const ticks = (px / innerW) * lengthTicks;
        pts.push(`${PLOT_PAD + px},${vy(sampleCurveAtTick(sorted, ticks, 'spline', cfg.min, cfg.max))}`);
      }
      return pts.join(' ');
    }
    const segs = [`${tx(0)},${vy(sorted[0]!.value)}`];
    for (const kf of sorted) segs.push(`${tx(kf.ticks)},${vy(kf.value)}`);
    segs.push(`${tx(lengthTicks)},${vy(sorted[sorted.length - 1]!.value)}`);
    return segs.join(' ');
  };

  const handlePlotPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Only fires for background presses — a dot's own pointerdown stops
    // propagation first. A same-spot second press within the window adds a
    // keyframe (manual double-click), matching ArrangementView's convention.
    const { x, y } = localXY(e);
    const last = lastDown.current;
    const isDouble =
      !!last &&
      e.timeStamp - last.time < DOUBLE_CLICK_MS &&
      Math.abs(x - last.x) < DOUBLE_CLICK_SLOP_PX &&
      Math.abs(y - last.y) < DOUBLE_CLICK_SLOP_PX;
    lastDown.current = isDouble ? null : { time: e.timeStamp, x, y };
    // Base on displayKeyframes so the very first added point also materializes
    // the default start/end handles (never a lone mid-bar point on a flat clip).
    if (isDouble) setKeyframes([...displayKeyframes, { ticks: Math.round(toTick(x)), value: toValue(y) }]);
  };

  const startDrag = (e: React.PointerEvent<HTMLDivElement>, d: { kind: 'point' | 'in' | 'out'; index: number }) => {
    e.stopPropagation();
    plotRef.current!.setPointerCapture(e.pointerId);
    // Collapse the drag into one undo step, same as every pointer gesture here.
    pauseHistory();
    drag.current = d;
  };

  const handlePlotPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const kf = displayKeyframes[d.index];
    if (!kf) return;
    const { x, y } = localXY(e);

    if (d.kind === 'point') {
      // Spread keeps the point's own hIn/hOut (offsets are relative, so they
      // ride along as the point moves).
      const ticks = Math.round(toTick(x));
      const value = toValue(y);
      setKeyframes(displayKeyframes.map((k, i) => (i === d.index ? { ...k, ticks, value } : k)));
      return;
    }

    // Handle end: store as an offset from the keyframe. toTick/toValue clamp to
    // [0,len]x[min,max] so the end stays on-screen; the side clamp keeps an
    // 'in' handle pointing back and an 'out' handle pointing forward.
    const dticks = toTick(x) - kf.ticks;
    const handle = {
      dticks: d.kind === 'in' ? Math.min(0, dticks) : Math.max(0, dticks),
      dvalue: toValue(y) - kf.value,
    };
    const patch = d.kind === 'in' ? { hIn: handle } : { hOut: handle };
    setKeyframes(displayKeyframes.map((k, i) => (i === d.index ? { ...k, ...patch } : k)));
  };

  const handlePlotPointerUp = () => {
    if (drag.current) resumeHistory();
    drag.current = null;
  };

  const handleDotDelete = (e: React.MouseEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    // Deleting a virtual endpoint just leaves the other(s) as the real set.
    setKeyframes(displayKeyframes.filter((_, i) => i !== index));
  };

  // Right-click a handle end to clear the explicit tangent -> back to the auto
  // (neighbor-slope) default.
  const handleHandleReset = (e: React.MouseEvent, index: number, which: 'in' | 'out') => {
    e.preventDefault();
    e.stopPropagation();
    setKeyframes(
      displayKeyframes.map((k, i) => {
        if (i !== index) return k;
        const next = { ...k };
        if (which === 'in') delete next.hIn;
        else delete next.hOut;
        return next;
      }),
    );
  };

  return (
    <aside className="flex shrink-0 flex-col border-l border-hairline pl-3" style={{ width: RAIL_WIDTH }}>
      <div className="mb-2 flex shrink-0 items-center gap-2">
        <select
          value={channel}
          onChange={(e) => setChannel(e.target.value as Channel)}
          title="Which clip parameter these keyframes control"
          className="label-mono rounded border border-hairline bg-surface-2 px-1.5 py-1 text-ink"
        >
          <option value="volume">Volume</option>
          <option value="speed">Speed</option>
        </select>
        <div className="ml-auto flex gap-1">
          {(['linear', 'spline'] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCurve(c)}
              aria-pressed={curve === c}
              title={c === 'spline' ? 'Smooth curve through every point' : 'Straight lines between points'}
              className={[
                'rounded border px-2 py-0.5 text-[10px] capitalize',
                curve === c ? 'border-accent bg-accent/20 text-accent' : 'border-hairline text-ink-dim hover:text-ink',
              ].join(' ')}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div
        ref={setPlotEl}
        onPointerDown={handlePlotPointerDown}
        onPointerMove={handlePlotPointerMove}
        onPointerUp={handlePlotPointerUp}
        onPointerCancel={handlePlotPointerUp}
        className="relative w-full flex-1 touch-none overflow-hidden rounded border border-hairline bg-surface-0"
        style={{ minHeight: MIN_PLOT_H }}
        title="Double-click to add a point · drag a point to move · right-click a point to delete"
      >
        {ready && (
          <>
            <svg className="pointer-events-none absolute inset-0" width={dims.w} height={dims.h}>
              {beatLines.map((t) => (
                <line key={`b${t}`} x1={tx(t)} y1={PLOT_PAD} x2={tx(t)} y2={PLOT_PAD + innerH} stroke="var(--color-hairline)" strokeWidth={1} opacity={0.25} />
              ))}
              {cfg.gridValues.map((v) => (
                <line key={`v${v}`} x1={PLOT_PAD} y1={vy(v)} x2={PLOT_PAD + innerW} y2={vy(v)} stroke="var(--color-hairline)" strokeWidth={1} opacity={v === cfg.def ? 0.45 : 0.25} />
              ))}
              <polyline points={curvePoints()} fill="none" stroke="var(--color-accent)" strokeWidth={1.5} opacity={0.9} />
              {/* Tangent handle "bars" from each point to its handle end (spline only). */}
              {handleEnds.map((h) => (
                <line key={`hb${h.index}-${h.which}`} x1={h.px} y1={h.py} x2={h.ex} y2={h.ey} stroke="var(--color-accent)" strokeWidth={1} opacity={0.55} />
              ))}
            </svg>
            {/* Handle ends: small squares, drawn under the round keyframe dots so a
                point sitting on top of its own handle stays grabbable. */}
            {handleEnds.map((h) => (
              <div
                key={`he${h.index}-${h.which}`}
                onPointerDown={(e) => startDrag(e, { kind: h.which, index: h.index })}
                onContextMenu={(e) => handleHandleReset(e, h.index, h.which)}
                className="absolute z-10 h-2 w-2 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-[1px] border border-accent bg-surface-0 active:cursor-grabbing"
                style={{ left: h.ex, top: h.ey }}
                title="Tangent handle — drag to bend the curve into/out of the point, right-click to reset"
              />
            ))}
            {displayKeyframes.map((kf, i) => (
              <div
                key={i}
                onPointerDown={(e) => startDrag(e, { kind: 'point', index: i })}
                onContextMenu={(e) => handleDotDelete(e, i)}
                className={[
                  'absolute z-20 h-3 w-3 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-2 border-surface-0 active:cursor-grabbing',
                  hasReal ? 'bg-accent' : 'bg-accent/60 ring-1 ring-accent',
                ].join(' ')}
                style={{ left: tx(kf.ticks), top: vy(kf.value) }}
                title={`${cfg.format(kf.value)} at bar ${Math.round((kf.ticks / lengthTicks) * 100)}% — drag to move, right-click to delete`}
              />
            ))}
          </>
        )}
      </div>

      <div className="mt-3 flex shrink-0 items-center gap-2 text-[10px] leading-tight text-ink-faint">
        <span>
          {channel === 'volume'
            ? `Shapes each ${cfg.scaledWhat}'s volume across the bar.`
            : 'Warps playback speed across the bar (overrides the clip speed scalar).'}{' '}
          {curve === 'spline'
            ? 'Drag a point to move it, drag its square handles to bend the curve, double-click to add a point.'
            : 'Drag the points or double-click to add a point.'}
        </span>
        {keyframes.length > 0 && (
          <button
            type="button"
            onClick={() => setKeyframes([])}
            title="Remove every point in this channel"
            className="ml-auto shrink-0 rounded border border-hairline px-1.5 py-0.5 text-ink-dim hover:border-record hover:text-record"
          >
            Clear
          </button>
        )}
      </div>
    </aside>
  );
}
