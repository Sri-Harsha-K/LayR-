import { useEffect, useRef } from 'react';
import { getTransientState } from '../../state/transient';
import { useProjectStore } from '../../state/projectStore';
import { useUiStore } from '../../state/uiStore';
import { toggleRecording } from '../../engine/recordingController';

// Overlays the main content area while recording (mock screen 04, "Capture").
// Waveform + input level are drawn straight to canvas/DOM in a rAF loop, not
// React state — same "never React state for per-frame data" rule every
// meter/playhead in this app already follows (see transient.ts's header
// comment). Mock also shows Monitor and Loop-record toggles; neither has a
// real mechanism behind it yet (no hardware-monitoring or loop-record
// concept in the engine), so they're intentionally left out rather than
// shipping switches that do nothing.
export function CaptureView() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const levelFillRef = useRef<HTMLDivElement>(null);
  const colorsRef = useRef({ record: '#d94f4f', green: '#7fbf6a', amber: '#e0b13f' });
  const tracks = useProjectStore((s) => s.project.tracks);
  const armedTrack = tracks.find((t) => t.kind === 'audio' && t.armed);
  const metronomeEnabled = useUiStore((s) => s.metronomeEnabled);
  const setMetronomeEnabled = useUiStore((s) => s.setMetronomeEnabled);

  useEffect(() => {
    const style = getComputedStyle(document.documentElement);
    const read = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
    colorsRef.current = {
      record: read('--color-record', '#d94f4f'),
      green: read('--color-meter-green', '#7fbf6a'),
      amber: read('--color-meter-amber', '#e0b13f'),
    };
  }, []);

  // Canvas backing resolution must match its displayed size (in device
  // pixels) or the waveform draws stretched/blurry — a ResizeObserver keeps
  // it in sync without recomputing every rAF frame.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      canvas.width = Math.max(1, Math.round(entry.contentRect.width * ratio));
      canvas.height = Math.max(1, Math.round(entry.contentRect.height * ratio));
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let raf: number;
    const loop = () => {
      const wf = getTransientState().recordingWaveform;
      const canvas = canvasRef.current;
      let peak = 0;
      const ctx = canvas?.getContext('2d');
      if (canvas && ctx) {
        const { width, height } = canvas;
        ctx.clearRect(0, 0, width, height);
        if (wf && wf.length > 0) {
          ctx.beginPath();
          ctx.strokeStyle = colorsRef.current.record;
          ctx.lineWidth = 1.5;
          const step = width / wf.length;
          for (let i = 0; i < wf.length; i++) {
            const v = wf[i]!;
            peak = Math.max(peak, Math.abs(v));
            const x = i * step;
            const y = height / 2 - v * (height / 2);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
      }
      const fill = levelFillRef.current;
      if (fill) {
        fill.style.height = `${Math.round(peak * 100)}%`;
        fill.style.backgroundColor = peak > 0.9 ? colorsRef.current.amber : colorsRef.current.green;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="absolute inset-0 z-30 flex flex-col gap-4 bg-surface-0 p-6">
      <div className="flex items-center gap-3">
        <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-record" />
        <span className="label-mono text-record">Recording</span>
        <span className="text-sm text-ink-dim">{armedTrack?.name ?? 'Audio'}</span>
        <button
          type="button"
          onClick={() => void toggleRecording()}
          className="ml-auto rounded-md border border-record px-3 py-1.5 text-sm text-record hover:bg-record/10"
        >
          Stop (R)
        </button>
      </div>
      <div className="flex min-h-0 flex-1 gap-4">
        <div className="min-w-0 flex-1 overflow-hidden rounded-md border border-hairline bg-surface-1">
          <canvas ref={canvasRef} className="h-full w-full" />
        </div>
        <div className="flex w-32 shrink-0 flex-col items-center gap-3">
          <span className="label-mono text-ink-faint">Input</span>
          <div className="relative h-40 w-6 overflow-hidden rounded-sm bg-surface-2">
            <div
              ref={levelFillRef}
              className="absolute inset-x-0 bottom-0"
              style={{ height: '0%', backgroundColor: 'var(--color-meter-green)' }}
            />
          </div>
          <label className="flex w-full items-center justify-between text-xs text-ink-dim">
            Metronome
            <input
              type="checkbox"
              checked={metronomeEnabled}
              onChange={(e) => setMetronomeEnabled(e.target.checked)}
              className="accent-accent"
            />
          </label>
        </div>
      </div>
    </div>
  );
}
