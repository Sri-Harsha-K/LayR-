import { useRef } from 'react';

interface ResizeHandleProps {
  /** 'x' = a vertical bar, drag left/right (rail width); 'y' = a horizontal bar, drag up/down (dock height). */
  axis: 'x' | 'y';
  /** Called with the pointer's delta (px) since the last move — the caller adds/subtracts this to its own current size and clamps, rather than this component tracking an absolute value. */
  onResize: (deltaPx: number) => void;
  label: string;
}

export function ResizeHandle({ axis, onResize, label }: ResizeHandleProps) {
  const lastPos = useRef<number | null>(null);

  const posOf = (e: React.PointerEvent) => (axis === 'x' ? e.clientX : e.clientY);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    lastPos.current = posOf(e);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (lastPos.current === null) return;
    const pos = posOf(e);
    onResize(pos - lastPos.current);
    lastPos.current = pos;
  };

  const handlePointerUp = () => {
    lastPos.current = null;
  };

  return (
    <div
      role="separator"
      aria-orientation={axis === 'x' ? 'vertical' : 'horizontal'}
      aria-label={label}
      title={label}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      className={[
        'shrink-0 touch-none bg-hairline/60 transition-colors hover:bg-accent active:bg-accent',
        axis === 'x' ? 'w-1 cursor-col-resize' : 'h-1 cursor-row-resize',
      ].join(' ')}
    />
  );
}
