import { useEffect, useRef, useState } from 'react';
import { useUiStore } from '../state/uiStore';
import { useProjectStore } from '../state/projectStore';
import { audioEngine } from '../engine/AudioEngine';
import { subscribeTransportState } from '../engine/transport';
import { toggleRecording } from '../engine/recordingController';
import { openProject, saveProject, saveProjectAs } from '../engine/projectIO';
import { bounceProject } from '../engine/render';
import { getTransientState } from '../state/transient';
import { useIsRecording } from '../hooks/useIsRecording';
import { TimeDisplay } from './TimeDisplay';

const MASTER_METER_SEGMENTS = 16;

function IconButton({
  label,
  active,
  danger,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  danger?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={[
        'flex h-9 w-9 items-center justify-center rounded-md border transition-colors disabled:cursor-not-allowed disabled:opacity-40',
        danger
          ? active
            ? 'border-record bg-record text-surface-0'
            : 'border-hairline text-record hover:border-record'
          : active
            ? 'border-accent bg-accent/20 text-accent'
            : 'border-hairline text-ink-dim hover:text-ink hover:border-ink-faint',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

function MasterMeter() {
  const segmentRefs = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(() => {
    let raf: number;
    const loop = () => {
      const level = getTransientState().masterMeterLevel;
      const lit = Math.round(level * MASTER_METER_SEGMENTS);
      segmentRefs.current.forEach((el, i) => {
        if (!el) return;
        const isLit = i < lit;
        const isHot = i >= MASTER_METER_SEGMENTS - 2; // top 2 segments read as "hot", never red — see index.css
        el.style.backgroundColor = isLit
          ? isHot
            ? 'var(--color-meter-amber)'
            : 'var(--color-meter-green)'
          : 'var(--color-surface-3)';
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="flex h-6 w-24 items-center gap-[2px] rounded bg-surface-2 px-1" aria-label="Master meter">
      {Array.from({ length: MASTER_METER_SEGMENTS }).map((_, i) => (
        <span
          key={i}
          ref={(el) => {
            segmentRefs.current[i] = el;
          }}
          className="h-3 flex-1 rounded-sm bg-surface-3"
        />
      ))}
    </div>
  );
}

function FileControls() {
  const projectName = useProjectStore((s) => s.project.name);
  const isDirty = useUiStore((s) => s.isProjectDirty);

  return (
    <div className="flex items-center gap-2 border-r border-hairline pr-3">
      <span className="max-w-[10rem] truncate text-sm text-ink-dim" title={projectName}>
        {projectName}
        {isDirty && <span className="text-record"> •</span>}
      </span>
      <button
        type="button"
        title="Open (Ctrl/Cmd+O)"
        onClick={() => void openProject()}
        className="rounded-md border border-hairline px-2 py-1 text-xs text-ink-dim hover:text-ink"
      >
        Open
      </button>
      <button
        type="button"
        title="Save (Ctrl/Cmd+S)"
        onClick={() => void saveProject()}
        className="rounded-md border border-hairline px-2 py-1 text-xs text-ink-dim hover:text-ink"
      >
        Save
      </button>
      <button
        type="button"
        title="Save As (Ctrl/Cmd+Shift+S)"
        onClick={() => void saveProjectAs()}
        className="rounded-md border border-hairline px-2 py-1 text-xs text-ink-dim hover:text-ink"
      >
        Save As
      </button>
    </div>
  );
}

function MainViewSwitch() {
  const mainView = useUiStore((s) => s.mainView);
  const setMainView = useUiStore((s) => s.setMainView);

  return (
    <div className="flex items-center gap-0.5 rounded-md border border-hairline p-0.5">
      {(['timeline', 'session'] as const).map((view) => (
        <button
          key={view}
          type="button"
          onClick={() => setMainView(view)}
          aria-pressed={mainView === view}
          className={[
            'label-mono rounded px-2 py-1 transition-colors',
            mainView === view ? 'bg-accent/20 text-accent' : 'text-ink-faint hover:text-ink',
          ].join(' ')}
        >
          {view}
        </button>
      ))}
    </div>
  );
}

export function TransportBar() {
  const bpm = useProjectStore((s) => s.project.bpm);
  const setBpm = useProjectStore((s) => s.setBpm);
  const loopEnabled = useUiStore((s) => s.loopEnabled);
  const setLoopEnabled = useUiStore((s) => s.setLoopEnabled);
  const metronomeEnabled = useUiStore((s) => s.metronomeEnabled);
  const setMetronomeEnabled = useUiStore((s) => s.setMetronomeEnabled);
  const isPoweredOn = useUiStore((s) => s.isPoweredOn);
  const tracks = useProjectStore((s) => s.project.tracks);
  const armedAudioTrack = tracks.find((t) => t.kind === 'audio' && t.armed);

  const project = useProjectStore((s) => s.project);

  const [isPlaying, setIsPlaying] = useState(false);
  const isRecording = useIsRecording();
  const [isBouncing, setIsBouncing] = useState(false);

  const handleBounce = async () => {
    if (isBouncing) return;
    setIsBouncing(true);
    try {
      await bounceProject(project);
    } finally {
      setIsBouncing(false);
    }
  };

  useEffect(() => subscribeTransportState((event) => setIsPlaying(event === 'started')), []);

  const togglePlay = () => {
    if (isPlaying) audioEngine.pause();
    else void audioEngine.play();
  };

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-hairline bg-surface-1 px-4">
      <div className="flex items-center gap-2">
        <FileControls />
        <MainViewSwitch />
        <IconButton label="Play / Stop (Space)" active={isPlaying} disabled={!isPoweredOn} onClick={togglePlay}>
          {isPlaying ? (
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
              <rect x="6" y="5" width="4" height="14" />
              <rect x="14" y="5" width="4" height="14" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </IconButton>
        <IconButton
          label={
            isRecording
              ? 'Stop recording (R)'
              : armedAudioTrack
                ? `Record to "${armedAudioTrack.name}" (R)`
                : 'Arm an audio track to record (R)'
          }
          danger
          active={isRecording}
          disabled={!isPoweredOn || (!isRecording && !armedAudioTrack)}
          onClick={() => void toggleRecording()}
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
            <circle cx="12" cy="12" r="8" />
          </svg>
        </IconButton>
        <IconButton
          label="Return to zero (Enter)"
          disabled={!isPoweredOn}
          onClick={() => audioEngine.returnToZero()}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <path d="M6 5h2v14H6zM20 6l-9 6 9 6z" />
          </svg>
        </IconButton>
        <IconButton label="Loop (L)" active={loopEnabled} onClick={() => setLoopEnabled(!loopEnabled)}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M17 2l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M3 11V9a4 4 0 0 1 4-4h14" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M7 22l-4-4 4-4" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M21 13v2a4 4 0 0 1-4 4H3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </IconButton>
        <IconButton
          label="Metronome (click to toggle)"
          active={metronomeEnabled}
          onClick={() => setMetronomeEnabled(!metronomeEnabled)}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M8 21h8M12 3l6 18H6z" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M12 8l3 9" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </IconButton>
      </div>

      <div className="flex items-center gap-6">
        <label className="label-mono flex items-center gap-2 text-ink-dim">
          BPM
          <input
            type="number"
            min={40}
            max={240}
            value={bpm}
            onChange={(e) => setBpm(Number(e.target.value))}
            className="tabular w-16 rounded border border-hairline bg-surface-2 px-2 py-1 text-center text-ink"
          />
        </label>
        <TimeDisplay />
      </div>

      <div className="flex items-center gap-3">
        <MasterMeter />
        <button
          type="button"
          disabled={isBouncing}
          onClick={() => void handleBounce()}
          className="rounded-md border border-hairline px-3 py-1.5 text-sm text-ink-dim hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
          title="Bounce to WAV (Ctrl/Cmd+E)"
        >
          {isBouncing ? 'Bouncing…' : 'Bounce to WAV'}
        </button>
      </div>
    </header>
  );
}
