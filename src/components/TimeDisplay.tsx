import { useEffect, useRef } from 'react';
import { formatTicksAsPosition, TICKS_PER_BEAT } from '../engine/time';
import { getTransientState } from '../state/transient';
import { audioEngine } from '../engine/AudioEngine';

// No visual ruler backs this control (it's just a number readout), so drag
// sensitivity is a fixed rate rather than derived from any on-screen scale.
const PIXELS_PER_BEAT = 40;

/**
 * Playhead position, written straight to the DOM every animation frame.
 * Never goes through React state — see the performance notes in the brief.
 * Also drag-scrubbable: pointerdown+drag seeks the transport live.
 */
export function TimeDisplay() {
  const ref = useRef<HTMLDivElement>(null);
  const dragStart = useRef<{ x: number; ticks: number } | null>(null);

  useEffect(() => {
    let raf: number;
    const loop = () => {
      const el = ref.current;
      if (el) el.textContent = formatTicksAsPosition(getTransientState().playheadTicks);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    ref.current?.setPointerCapture(e.pointerId);
    dragStart.current = { x: e.clientX, ticks: getTransientState().playheadTicks };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const start = dragStart.current;
    if (!start) return;
    const deltaTicks = ((e.clientX - start.x) / PIXELS_PER_BEAT) * TICKS_PER_BEAT;
    audioEngine.seekTo(start.ticks + deltaTicks);
  };

  const handlePointerUp = () => {
    dragStart.current = null;
  };

  return (
    <div
      ref={ref}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      className="tabular cursor-ew-resize select-none touch-none font-mono text-lg text-ink"
      aria-label="Position — drag to scrub"
      title="Drag to move the playhead"
    >
      001:1:01
    </div>
  );
}
