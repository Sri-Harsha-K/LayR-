import { useEffect, useState } from 'react';
import { useProjectStore, nextClipName } from '../../state/projectStore';
import { useUiStore } from '../../state/uiStore';
import { audioEngine } from '../../engine/AudioEngine';
import { getSampleLibrary, subscribeSampleLibrary, type SampleMeta } from '../../engine/sampleRegistry';
import { secondsToTicks } from '../../engine/time';
import { generateId } from '../../utils/id';
import { DEFAULT_DRUM_LANES, type Clip } from '../../state/types';
import { SAMPLE_DRAG_MIME } from '../../utils/dragTypes';

type Category = 'all' | 'recorded' | 'imported' | 'builtin';

const CATEGORIES: { id: Category; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'recorded', label: 'Recorded' },
  { id: 'imported', label: 'Imported' },
  { id: 'builtin', label: 'Kit one-shots' },
];

function useSampleLibrary(): readonly SampleMeta[] {
  const [samples, setSamples] = useState<readonly SampleMeta[]>(() => getSampleLibrary());
  useEffect(() => subscribeSampleLibrary(() => setSamples([...getSampleLibrary()])), []);
  return samples;
}

function formatDuration(seconds: number): string {
  return `${seconds.toFixed(1)}s`;
}

export function LibraryPanel() {
  const samples = useSampleLibrary();
  const [category, setCategory] = useState<Category>('all');
  const [query, setQuery] = useState('');
  const addTrack = useProjectStore((s) => s.addTrack);
  const addClip = useProjectStore((s) => s.addClip);
  const selection = useUiStore((s) => s.selection);

  const q = query.trim().toLowerCase();
  const filteredSamples =
    category === 'builtin'
      ? []
      : samples.filter((s) => (category === 'all' || s.source === category) && s.name.toLowerCase().includes(q));
  const filteredBuiltIns =
    category === 'all' || category === 'builtin'
      ? DEFAULT_DRUM_LANES.filter((l) => l.label.toLowerCase().includes(q))
      : [];

  const recordedCount = samples.filter((s) => s.source === 'recorded').length;
  const importedCount = samples.filter((s) => s.source === 'imported').length;

  const handleAddToProject = (sample: SampleMeta) => {
    const state = useProjectStore.getState();
    let track =
      state.project.tracks.find((t) => t.id === selection.trackId && t.kind === 'audio') ??
      state.project.tracks.find((t) => t.kind === 'audio');
    if (!track) {
      const trackId = addTrack('audio');
      track = useProjectStore.getState().project.tracks.find((t) => t.id === trackId);
    }
    if (!track) return;
    const lengthTicks = Math.max(1, Math.round(secondsToTicks(sample.durationSeconds, state.project.bpm)));
    const clip: Clip = {
      id: generateId('clip'),
      startTicks: 0,
      lengthTicks,
      name: nextClipName(track, 'audio', sample.name),
      kind: 'audio',
      fileRef: sample.ref,
      bufferOffsetSec: 0,
      gainDb: 0,
    };
    addClip(track.id, clip);
  };

  const handleDragStart = (e: React.DragEvent, sample: SampleMeta) => {
    e.dataTransfer.setData(SAMPLE_DRAG_MIME, JSON.stringify({ ref: sample.ref, durationSeconds: sample.durationSeconds, name: sample.name }));
    e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <div className="flex h-full gap-3">
      <div className="flex w-40 shrink-0 flex-col gap-1">
        <span className="label-mono text-ink-faint">Categories</span>
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setCategory(c.id)}
            aria-pressed={category === c.id}
            className={[
              'flex items-center justify-between rounded px-2 py-1 text-left text-xs',
              category === c.id ? 'bg-accent/20 text-accent' : 'text-ink-dim hover:text-ink',
            ].join(' ')}
          >
            {c.label}
            {c.id === 'recorded' && <span className="tabular text-ink-faint">{recordedCount}</span>}
            {c.id === 'imported' && <span className="tabular text-ink-faint">{importedCount}</span>}
            {c.id === 'builtin' && <span className="tabular text-ink-faint">{DEFAULT_DRUM_LANES.length}</span>}
          </button>
        ))}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search loops & samples…"
          className="rounded border border-hairline bg-surface-2 px-2 py-1.5 text-sm text-ink"
        />
        <div className="flex-1 overflow-auto">
          {filteredSamples.length === 0 && filteredBuiltIns.length === 0 && (
            <div className="flex h-full items-center justify-center text-xs text-ink-faint">
              No samples yet — record a take or load a sample onto a drum lane.
            </div>
          )}
          {filteredBuiltIns.map((lane) => (
            <div key={lane.laneId} className="flex items-center gap-2 border-b border-hairline py-1.5 text-xs">
              <button
                type="button"
                onClick={() => audioEngine.previewBuiltInDrumSound(lane.laneId)}
                title="Preview"
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-hairline text-[10px] text-ink-dim hover:border-accent hover:text-accent"
              >
                ▶
              </button>
              <span className="flex-1 truncate text-ink">{lane.label}</span>
              <span className="text-ink-faint">Kit one-shot</span>
            </div>
          ))}
          {filteredSamples.map((sample) => (
            <div
              key={sample.ref}
              draggable
              onDragStart={(e) => handleDragStart(e, sample)}
              title="Drag onto an audio track, or click Add"
              className="flex items-center gap-2 border-b border-hairline py-1.5 text-xs"
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-hairline text-[10px] text-ink-faint" aria-hidden>
                ⠿
              </span>
              <span className="flex-1 truncate text-ink">{sample.name}</span>
              <span className="tabular text-ink-faint">{formatDuration(sample.durationSeconds)}</span>
              <span className="text-ink-faint">{sample.source}</span>
              <button
                type="button"
                onClick={() => handleAddToProject(sample)}
                className="rounded border border-hairline px-2 py-0.5 text-ink-dim hover:border-accent hover:text-accent"
              >
                Add
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
