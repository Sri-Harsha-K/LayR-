import { useRef } from 'react';

interface PadProps {
  on: boolean;
  velocity: number;
  accent: boolean;
  onToggle: () => void;
  onVelocityChange: (velocity: number) => void;
  padRef: (el: HTMLButtonElement | null) => void;
}

const DRAG_PIXELS_FOR_FULL_RANGE = 100;

export function Pad({ on, velocity, accent, onToggle, onVelocityChange, padRef }: PadProps) {
  const dragState = useRef<{ startY: number; startVelocity: number } | null>(null);
  const moved = useRef(false);

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    moved.current = false;
    if (on) {
      dragState.current = { startY: e.clientY, startVelocity: velocity };
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragState.current) return;
    const dy = dragState.current.startY - e.clientY;
    if (Math.abs(dy) > 2) moved.current = true;
    const next = Math.max(0.05, Math.min(1, dragState.current.startVelocity + dy / DRAG_PIXELS_FOR_FULL_RANGE));
    onVelocityChange(next);
  };

  const handlePointerUp = () => {
    if (!on || !moved.current) onToggle();
    dragState.current = null;
    moved.current = false;
  };

  return (
    <button
      ref={padRef}
      type="button"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      aria-pressed={on}
      aria-label={on ? `Step on, velocity ${Math.round(velocity * 100)}%` : 'Step off'}
      className={[
        'pad relative h-8 w-8 shrink-0 touch-none rounded-[3px] border transition-colors',
        accent ? 'border-ink-faint/60' : 'border-hairline/60',
        on ? 'border-transparent' : 'bg-surface-2 hover:bg-surface-3',
      ].join(' ')}
      style={
        on
          ? {
              backgroundColor: `color-mix(in srgb, var(--color-meter-amber) ${Math.round(30 + velocity * 70)}%, var(--color-surface-2))`,
              boxShadow: `0 0 ${4 + velocity * 6}px color-mix(in srgb, var(--color-meter-amber) ${Math.round(velocity * 70)}%, transparent)`,
            }
          : undefined
      }
    />
  );
}
