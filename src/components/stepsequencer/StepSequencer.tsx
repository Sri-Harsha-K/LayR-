import { useEffect, useMemo, useRef } from 'react';
import { useProjectStore } from '../../state/projectStore';
import { useUiStore } from '../../state/uiStore';
import { audioEngine } from '../../engine/AudioEngine';
import { clampSwing, patternLengthTicks, TICKS_PER_SIXTEENTH } from '../../engine/time';
import { getTransientState } from '../../state/transient';
import { platform } from '../../platform';
import { registerSample } from '../../engine/sampleRegistry';
import type { DrumPattern, DrumStep } from '../../state/types';
import { Pad } from './Pad';

function updateLaneSteps(pattern: DrumPattern, laneId: string, mapStep: (step: DrumStep, index: number) => DrumStep): DrumPattern {
  return {
    ...pattern,
    lanes: pattern.lanes.map((l) => (l.laneId === laneId ? { ...l, steps: l.steps.map(mapStep) } : l)),
  };
}

export function StepSequencer() {
  const selection = useUiStore((s) => s.selection);
  const tracks = useProjectStore((s) => s.project.tracks);
  const updateClip = useProjectStore((s) => s.updateClip);
  const setTrackDrumKit = useProjectStore((s) => s.setTrackDrumKit);

  const track = tracks.find((t) => t.id === selection.trackId);
  const clip = track?.clips.find((c) => c.id === selection.clipId);

  const padRefs = useRef(new Map<string, HTMLButtonElement>());
  const lastPlayingCol = useRef<number>(-1);

  const isPatternClip = !!track && track.kind === 'drum' && !!clip && clip.kind === 'pattern';
  const pattern = isPatternClip ? (clip as Extract<typeof clip, { kind: 'pattern' }>).pattern : null;

  const patternLenTicks = useMemo(() => (pattern ? patternLengthTicks(pattern.steps) : 0), [pattern]);

  useEffect(() => {
    if (!isPatternClip || !clip) return;
    let raf: number;
    const loop = () => {
      const t = getTransientState();
      let col = -1;
      if (t.isPlaying && patternLenTicks > 0) {
        const local = (((t.playheadTicks - clip.startTicks) % patternLenTicks) + patternLenTicks) % patternLenTicks;
        if (t.playheadTicks >= clip.startTicks && t.playheadTicks < clip.startTicks + clip.lengthTicks) {
          col = Math.floor(local / TICKS_PER_SIXTEENTH);
        }
      }
      if (col !== lastPlayingCol.current) {
        if (lastPlayingCol.current >= 0) {
          padRefs.current.forEach((el, key) => {
            if (key.endsWith(`:${lastPlayingCol.current}`)) el.classList.remove('pad-playing');
          });
        }
        if (col >= 0) {
          padRefs.current.forEach((el, key) => {
            if (key.endsWith(`:${col}`)) el.classList.add('pad-playing');
          });
        }
        lastPlayingCol.current = col;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [isPatternClip, clip, patternLenTicks]);

  if (!track || !clip || !pattern) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-ink-faint">
        Select a drum pattern clip to edit its steps.
      </div>
    );
  }

  const lanes = track.drumKit ?? [];

  const patchPattern = (patch: Partial<DrumPattern>) => {
    updateClip(track.id, clip.id, { pattern: { ...pattern, ...patch } });
  };

  const toggleStep = (laneId: string, stepIndex: number) => {
    const currentlyOn = pattern.lanes.find((l) => l.laneId === laneId)?.steps[stepIndex]?.on ?? false;
    patchPattern(
      updateLaneSteps(pattern, laneId, (step, i) =>
        i === stepIndex ? { on: !step.on, velocity: step.on ? step.velocity : 0.85 } : step,
      ),
    );
    if (!currentlyOn) audioEngine.previewDrumLane(track.id, laneId);
  };

  const setStepVelocity = (laneId: string, stepIndex: number, velocity: number) => {
    patchPattern(
      updateLaneSteps(pattern, laneId, (step, i) => (i === stepIndex ? { ...step, velocity } : step)),
    );
  };

  const handleLoadSample = async (laneId: string) => {
    const file = await platform.pickSampleFile();
    if (!file) return;
    const { ref } = await registerSample(file.name, file.data);
    setTrackDrumKit(
      track.id,
      lanes.map((l) => (l.laneId === laneId ? { ...l, sampleRef: ref } : l)),
    );
  };

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-xs text-ink-dim">
          Swing
          <input
            type="range"
            min={0}
            max={0.66}
            step={0.01}
            value={pattern.swing}
            onChange={(e) => patchPattern({ swing: clampSwing(Number(e.target.value)) })}
            className="w-28 accent-track-2"
          />
          <span className="tabular w-10">{Math.round((pattern.swing / 0.66) * 100)}%</span>
        </label>
        <span className="text-xs text-ink-faint">{pattern.steps} steps</span>
      </div>

      <div className="flex flex-1 flex-col gap-1 overflow-auto">
        {lanes.map((lane) => {
          const laneSteps = pattern.lanes.find((l) => l.laneId === lane.laneId)?.steps ?? [];
          return (
            <div key={lane.laneId} className="flex items-center gap-2">
              <div className="flex w-28 shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => setTrackDrumKit(track.id, lanes.map((l) => (l.laneId === lane.laneId ? { ...l, mute: !l.mute } : l)))}
                  aria-pressed={lane.mute}
                  title="Mute lane"
                  className={[
                    'h-4 w-4 shrink-0 rounded-sm border text-[9px] leading-none',
                    lane.mute ? 'border-meter-amber bg-meter-amber/20 text-meter-amber' : 'border-hairline text-ink-faint',
                  ].join(' ')}
                >
                  M
                </button>
                <button
                  type="button"
                  onClick={() => void handleLoadSample(lane.laneId)}
                  className="truncate text-left text-xs text-ink-dim hover:text-ink"
                  title={lane.sampleRef ? `Sample: ${lane.sampleRef.split('/').pop()}` : 'Click to load a sample'}
                >
                  {lane.label}
                  {lane.sampleRef && <span className="text-track-6"> ●</span>}
                </button>
              </div>
              <div className="flex gap-1">
                {laneSteps.map((step, i) => (
                  <Pad
                    key={i}
                    on={step.on}
                    velocity={step.velocity}
                    accent={i % 4 === 0}
                    onToggle={() => toggleStep(lane.laneId, i)}
                    onVelocityChange={(v) => setStepVelocity(lane.laneId, i, v)}
                    padRef={(el) => {
                      const key = `${lane.laneId}:${i}`;
                      if (el) padRefs.current.set(key, el);
                      else padRefs.current.delete(key);
                    }}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
