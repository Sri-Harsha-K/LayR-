import { useState } from 'react';
import { furthestClipEndTicks, useProjectStore } from '../state/projectStore';
import { useUiStore } from '../state/uiStore';
import { exportProject, type ExportFormat } from '../engine/render';
import { ticksToSeconds } from '../engine/time';
import type { WavBitDepth } from '../engine/wavEncoder';

const SAMPLE_RATES = [44100, 48000, 96000];
const BIT_DEPTHS: WavBitDepth[] = [16, 24];
const FORMATS: ExportFormat[] = ['wav', 'mp3', 'flac', 'stems'];
// Mirrors render.ts's own release-tail estimate — this is a UI length/size
// preview, not required to match exactly.
const RELEASE_TAIL_SECONDS = 1;
const MP3_KBPS = 192;

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function ExportDialog() {
  const isOpen = useUiStore((s) => s.isExportDialogOpen);
  const setOpen = useUiStore((s) => s.setExportDialogOpen);
  const project = useProjectStore((s) => s.project);
  const [format, setFormat] = useState<ExportFormat>('wav');
  const [sampleRate, setSampleRate] = useState(48000);
  const [bitDepth, setBitDepth] = useState<WavBitDepth>(16);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const durationSeconds = Math.max(
    1,
    ticksToSeconds(furthestClipEndTicks(project.tracks), project.bpm) + RELEASE_TAIL_SECONDS,
  );
  const wavBytes = durationSeconds * sampleRate * 2 * (bitDepth / 8) + 44;
  const estimatedBytes =
    format === 'mp3'
      ? (durationSeconds * MP3_KBPS * 1000) / 8
      : format === 'stems'
        ? project.tracks.length * wavBytes
        : wavBytes;

  const handleExport = async () => {
    setIsExporting(true);
    setError(null);
    try {
      const ok = await exportProject(project, { format, sampleRate, bitDepth, mp3Kbps: MP3_KBPS });
      if (ok) setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-surface-0/80"
      onClick={() => !isExporting && setOpen(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex w-96 flex-col gap-4 rounded-lg border border-hairline bg-surface-1 p-5"
      >
        <div className="flex items-center justify-between">
          <span className="text-sm text-ink">Export</span>
          <span className="max-w-[12rem] truncate text-xs text-ink-faint">{project.name}</span>
        </div>

        <div className="flex flex-col gap-1">
          <span className="label-mono text-ink-faint">Format</span>
          <div className="grid grid-cols-4 gap-1">
            {FORMATS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFormat(f)}
                aria-pressed={format === f}
                className={[
                  'rounded border px-2 py-1.5 text-xs uppercase transition-colors',
                  format === f ? 'border-accent bg-accent/20 text-accent' : 'border-hairline text-ink-dim hover:text-ink',
                ].join(' ')}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-xs text-ink-faint">
            Sample rate
            <select
              value={sampleRate}
              onChange={(e) => setSampleRate(Number(e.target.value))}
              className="rounded border border-hairline bg-surface-2 px-2 py-1 text-ink"
            >
              {SAMPLE_RATES.map((sr) => (
                <option key={sr} value={sr}>
                  {(sr / 1000).toFixed(1)} kHz
                </option>
              ))}
            </select>
          </label>
          {format !== 'mp3' && (
            <label className="flex flex-col gap-1 text-xs text-ink-faint">
              Bit depth
              <select
                value={bitDepth}
                onChange={(e) => setBitDepth(Number(e.target.value) as WavBitDepth)}
                className="rounded border border-hairline bg-surface-2 px-2 py-1 text-ink"
              >
                {BIT_DEPTHS.map((bd) => (
                  <option key={bd} value={bd}>
                    {bd}-bit
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {format === 'flac' && (
          <p className="text-xs text-meter-amber">
            FLAC export isn't available in this build yet — pick WAV, MP3, or Stems.
          </p>
        )}
        {format === 'stems' && (
          <p className="text-xs text-ink-faint">One WAV per track ({project.tracks.length}), bundled as a .zip.</p>
        )}

        <div className="flex items-center justify-between text-xs text-ink-faint">
          <span>Length {formatDuration(durationSeconds)}</span>
          {format !== 'flac' && <span>est. {formatBytes(estimatedBytes)}</span>}
        </div>

        {error && <p className="text-xs text-record">{error}</p>}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setOpen(false)}
            disabled={isExporting}
            className="rounded-md border border-hairline px-3 py-1.5 text-sm text-ink-dim hover:text-ink disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleExport()}
            disabled={isExporting || format === 'flac' || project.tracks.length === 0}
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-surface-0 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isExporting ? 'Exporting…' : `Export ${format.toUpperCase()}`}
          </button>
        </div>
      </div>
    </div>
  );
}
