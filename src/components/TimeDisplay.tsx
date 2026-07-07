import { useEffect, useRef } from 'react';
import { formatTicksAsPosition } from '../engine/time';
import { getTransientState } from '../state/transient';

/**
 * Playhead position, written straight to the DOM every animation frame.
 * Never goes through React state — see the performance notes in the brief.
 */
export function TimeDisplay() {
  const ref = useRef<HTMLDivElement>(null);

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

  return (
    <div ref={ref} className="tabular font-mono text-lg text-ink" aria-label="Position">
      001:1:01
    </div>
  );
}
