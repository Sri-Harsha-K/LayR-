import { useState } from 'react';
import * as Tone from 'tone';
import { useUiStore } from '../state/uiStore';

export function PowerOnOverlay() {
  const isPoweredOn = useUiStore((s) => s.isPoweredOn);
  const powerOn = useUiStore((s) => s.powerOn);
  const [starting, setStarting] = useState(false);

  if (isPoweredOn) return null;

  const handlePowerOn = async () => {
    setStarting(true);
    await Tone.start();
    powerOn();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface-0/95 backdrop-blur-sm">
      <button
        type="button"
        onClick={() => void handlePowerOn()}
        disabled={starting}
        className="group flex flex-col items-center gap-4 rounded-2xl border border-hairline bg-surface-1 px-16 py-12 transition-colors hover:border-track-4 disabled:opacity-60"
      >
        <span
          className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-ink-dim text-ink-dim transition-colors group-hover:border-meter-green group-hover:text-meter-green"
          aria-hidden
        >
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2v10" strokeLinecap="round" />
            <path d="M6.3 6.3a8 8 0 1 0 11.4 0" strokeLinecap="round" />
          </svg>
        </span>
        <span className="font-display text-xl text-ink">
          {starting ? 'Starting…' : 'Power On'}
        </span>
        <span className="text-sm text-ink-faint">Click to enable audio</span>
      </button>
    </div>
  );
}
