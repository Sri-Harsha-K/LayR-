import { useRef } from 'react';
import { pauseHistory, resumeHistory } from '../../state/projectStore';

// Same vertical-drag-delta convention as Pad.tsx's velocity drag and
// ChannelStrip's fader — one drag gesture, no separate click-vs-drag mode.
const DRAG_PIXELS_FOR_FULL_RANGE = 120;
const MIN_ANGLE = -135;
const MAX_ANGLE = 135;

interface KnobProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (value: number) => void;
}

export function Knob({ label, value, min, max, step = 0.01, unit, onChange }: KnobProps) {
  const dragState = useRef<{ startY: number; startValue: number } | null>(null);

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragState.current = { startY: e.clientY, startValue: value };
    pauseHistory();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragState.current) return;
    const dy = dragState.current.startY - e.clientY;
    const raw = dragState.current.startValue + (dy / DRAG_PIXELS_FOR_FULL_RANGE) * (max - min);
    const snapped = Math.round(raw / step) * step;
    onChange(Math.max(min, Math.min(max, snapped)));
  };

  const handlePointerUp = () => {
    if (dragState.current) resumeHistory();
    dragState.current = null;
  };

  const normalized = (value - min) / (max - min || 1);
  const angle = MIN_ANGLE + normalized * (MAX_ANGLE - MIN_ANGLE);
  const display = Number.isInteger(step) ? value : Number(value.toFixed(2));

  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        title={`${label}: ${display}${unit ?? ''} — drag vertically to adjust`}
        aria-label={label}
        className="relative h-10 w-10 shrink-0 touch-none rounded-full border border-hairline bg-surface-2 hover:border-accent focus-visible:border-accent"
        style={{ transform: `rotate(${angle}deg)` }}
      >
        <span className="absolute left-1/2 top-1 h-3 w-0.5 -translate-x-1/2 rounded-full bg-accent" />
      </button>
      <span className="text-[10px] text-ink-faint">{label}</span>
      <span className="tabular text-[10px] text-ink-dim">
        {display}
        {unit ?? ''}
      </span>
    </div>
  );
}
