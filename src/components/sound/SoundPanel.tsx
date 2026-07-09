import { useProjectStore } from '../../state/projectStore';
import { useUiStore } from '../../state/uiStore';
import { platform } from '../../platform';
import { registerSample } from '../../engine/sampleRegistry';
import { getPresetsForEngine } from '../../engine/instruments/synthPresets';
import type { SynthConfig } from '../../state/types';
import { EffectsRack } from '../mixer/EffectsRack';
import { Knob } from './Knob';
import { SYNTH_PARAM_FIELDS } from './synthParamFields';

function SynthInstrumentEditor({ trackId, instrument }: { trackId: string; instrument: SynthConfig }) {
  const setTrackInstrument = useProjectStore((s) => s.setTrackInstrument);
  const presets = getPresetsForEngine(instrument.engine);
  const fields = SYNTH_PARAM_FIELDS[instrument.engine];

  const patchParams = (key: string, value: number | string) => {
    setTrackInstrument(trackId, { ...instrument, params: { ...instrument.params, [key]: value } });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="label-mono text-ink-faint">{instrument.engine} synth</span>
        <select
          value={instrument.presetName}
          onChange={(e) => {
            const preset = presets.find((p) => p.presetName === e.target.value);
            if (preset) setTrackInstrument(trackId, { ...preset, params: { ...preset.params } });
          }}
          className="ml-auto rounded border border-hairline bg-surface-2 px-1.5 py-1 text-xs text-ink"
        >
          {presets.map((p) => (
            <option key={p.presetName} value={p.presetName}>
              {p.presetName}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap gap-4">
        {fields.map((field) => {
          if (field.kind === 'select') {
            const value = typeof instrument.params[field.key] === 'string' ? (instrument.params[field.key] as string) : field.options[0]!;
            return (
              <label key={field.key} className="flex flex-col items-center gap-1 text-[10px] text-ink-faint">
                {field.label}
                <select
                  value={value}
                  onChange={(e) => patchParams(field.key, e.target.value)}
                  className="rounded border border-hairline bg-surface-2 px-1 py-0.5 text-ink"
                >
                  {field.options.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </label>
            );
          }
          const value = typeof instrument.params[field.key] === 'number' ? (instrument.params[field.key] as number) : field.min;
          return (
            <Knob
              key={field.key}
              label={field.label}
              value={value}
              min={field.min}
              max={field.max}
              step={field.step}
              unit={field.unit}
              onChange={(v) => patchParams(field.key, v)}
            />
          );
        })}
      </div>
    </div>
  );
}

function DrumInstrumentEditor({ trackId }: { trackId: string }) {
  const track = useProjectStore((s) => s.project.tracks.find((t) => t.id === trackId));
  const setTrackDrumKit = useProjectStore((s) => s.setTrackDrumKit);
  const lanes = track?.drumKit ?? [];

  const handleLoadSample = async (laneId: string) => {
    const file = await platform.pickSampleFile();
    if (!file) return;
    const { ref } = await registerSample(file.name, file.data);
    setTrackDrumKit(trackId, lanes.map((l) => (l.laneId === laneId ? { ...l, sampleRef: ref } : l)));
  };

  return (
    <div className="flex flex-col gap-1">
      <span className="label-mono text-ink-faint">Kit lanes</span>
      {lanes.map((lane) => (
        <div key={lane.laneId} className="flex items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => setTrackDrumKit(trackId, lanes.map((l) => (l.laneId === lane.laneId ? { ...l, mute: !l.mute } : l)))}
            aria-pressed={lane.mute}
            title="Mute lane"
            className={[
              'h-4 w-4 shrink-0 rounded-sm border text-[9px] leading-none',
              lane.mute ? 'border-meter-amber bg-meter-amber/20 text-meter-amber' : 'border-hairline text-ink-faint',
            ].join(' ')}
          >
            M
          </button>
          <span className="w-16 shrink-0 text-ink-dim">{lane.label}</span>
          <button
            type="button"
            onClick={() => void handleLoadSample(lane.laneId)}
            className="truncate text-left text-ink-faint hover:text-ink"
            title={lane.sampleRef ? `Sample: ${lane.sampleRef.split('/').pop()}` : 'Click to load a sample'}
          >
            {lane.sampleRef ? lane.sampleRef.split('/').pop() : 'Synthesized'}
          </button>
        </div>
      ))}
    </div>
  );
}

export function SoundPanel() {
  const selection = useUiStore((s) => s.selection);
  const tracks = useProjectStore((s) => s.project.tracks);
  const updateClip = useProjectStore((s) => s.updateClip);
  const addTrackEffect = useProjectStore((s) => s.addTrackEffect);
  const removeTrackEffect = useProjectStore((s) => s.removeTrackEffect);
  const reorderTrackEffects = useProjectStore((s) => s.reorderTrackEffects);
  const updateTrackEffect = useProjectStore((s) => s.updateTrackEffect);

  const track = tracks.find((t) => t.id === selection.trackId);
  const clip = track?.clips.find((c) => c.id === selection.clipId);

  if (!track) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-ink-faint">
        Select a track or right-click a clip to edit its instrument &amp; effects.
      </div>
    );
  }

  return (
    <div className="flex h-full gap-4">
      <div className="flex w-1/2 flex-col gap-3 overflow-auto border-r border-hairline pr-4">
        {clip && (
          <label className="flex items-center gap-2 text-xs text-ink-dim">
            Name
            <input
              type="text"
              value={clip.name ?? ''}
              onChange={(e) => updateClip(track.id, clip.id, { name: e.target.value })}
              className="flex-1 rounded border border-hairline bg-surface-2 px-2 py-1 text-ink"
            />
          </label>
        )}
        {clip && (clip.volumeKeyframes?.length ?? 0) > 0 && (
          <div className="flex items-center gap-2 text-xs text-ink-dim">
            <span>Volume curve</span>
            <div className="flex gap-1">
              {(['linear', 'spline'] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => updateClip(track.id, clip.id, { volumeCurve: c })}
                  aria-pressed={(clip.volumeCurve ?? 'linear') === c}
                  title={c === 'spline' ? 'Smooth curve through every point' : 'Straight lines between points'}
                  className={[
                    'rounded border px-2 py-1 capitalize',
                    (clip.volumeCurve ?? 'linear') === c
                      ? 'border-accent bg-accent/20 text-accent'
                      : 'border-hairline text-ink-dim hover:text-ink',
                  ].join(' ')}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        )}
        {track.kind === 'synth' && track.instrument && (
          <SynthInstrumentEditor trackId={track.id} instrument={track.instrument} />
        )}
        {track.kind === 'drum' && <DrumInstrumentEditor trackId={track.id} />}
        {track.kind === 'audio' && (
          <span className="text-xs text-ink-faint">Audio track — no synthesized instrument.</span>
        )}
      </div>
      <div className="flex-1 overflow-auto">
        <span className="label-mono mb-2 block text-ink-faint">Effect chain</span>
        <EffectsRack
          effects={track.effects}
          onAdd={(fx) => addTrackEffect(track.id, fx)}
          onRemove={(fxId) => removeTrackEffect(track.id, fxId)}
          onReorder={(from, to) => reorderTrackEffects(track.id, from, to)}
          onUpdate={(fxId, patch) => updateTrackEffect(track.id, fxId, patch)}
        />
      </div>
    </div>
  );
}
