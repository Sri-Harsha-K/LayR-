import { useEffect, useRef } from 'react';
import { getTransientState } from '../../state/transient';
import { useUiStore } from '../../state/uiStore';
import { MiniToggle } from '../MiniToggle';
import type { EffectInstance } from '../../state/types';
import { EffectsRack } from './EffectsRack';
import { EFFECT_LABELS } from './effectFields';

interface ChannelStripProps {
  trackId?: string; // omitted for the master strip
  title: string;
  color?: string;
  gainDb: number;
  onGainChange: (db: number) => void;
  pan?: number;
  onPanChange?: (pan: number) => void;
  mute?: boolean;
  onMuteToggle?: () => void;
  solo?: boolean;
  onSoloToggle?: () => void;
  effects: EffectInstance[];
  onAddEffect: (effect: EffectInstance) => void;
  onRemoveEffect: (effectId: string) => void;
  onReorderEffect: (fromIndex: number, toIndex: number) => void;
  onUpdateEffect: (effectId: string, patch: Partial<EffectInstance>) => void;
}

export function ChannelStrip({
  trackId,
  title,
  color,
  gainDb,
  onGainChange,
  pan,
  onPanChange,
  mute,
  onMuteToggle,
  solo,
  onSoloToggle,
  effects,
  onAddEffect,
  onRemoveEffect,
  onReorderEffect,
  onUpdateEffect,
}: ChannelStripProps) {
  const meterFillRef = useRef<HTMLDivElement>(null);
  const selectTrack = useUiStore((s) => s.selectTrack);
  const setBottomPanelTab = useUiStore((s) => s.setBottomPanelTab);
  const openSoundTab = () => {
    if (!trackId) return;
    selectTrack(trackId);
    setBottomPanelTab('sound');
  };

  useEffect(() => {
    let raf: number;
    const loop = () => {
      const t = getTransientState();
      const level = trackId ? (t.meterLevels[trackId] ?? 0) : t.masterMeterLevel;
      const el = meterFillRef.current;
      if (el) {
        el.style.height = `${Math.round(level * 100)}%`;
        // Amber past ~-6dBFS as a hot-signal cue. Never meter-red — that
        // token is reserved for record/arm state (see index.css), not levels.
        el.style.backgroundColor = level > 0.9 ? 'var(--color-meter-amber)' : 'var(--color-meter-green)';
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [trackId]);

  return (
    <div
      className="flex w-32 shrink-0 flex-col gap-2 border-r border-hairline p-2"
      style={color ? { borderTop: `3px solid ${color}` } : { borderTop: '3px solid var(--color-ink-faint)' }}
    >
      <div className="truncate text-xs text-ink" title={title}>
        {title}
      </div>

      {(onMuteToggle || onSoloToggle) && (
        <div className="flex items-center gap-1">
          {onMuteToggle && <MiniToggle label="Mute" active={!!mute} onClick={onMuteToggle} />}
          {onSoloToggle && <MiniToggle label="Solo" active={!!solo} onClick={onSoloToggle} />}
        </div>
      )}

      {onPanChange && (
        <label className="label-mono flex flex-col gap-0.5 text-ink-faint">
          Pan
          <input
            type="range"
            min={-1}
            max={1}
            step={0.05}
            value={pan ?? 0}
            onChange={(e) => onPanChange(Number(e.target.value))}
            className="w-full accent-accent"
          />
        </label>
      )}

      <div className="flex flex-1 items-stretch gap-2">
        <div className="relative h-32 w-4 shrink-0 overflow-hidden rounded-sm bg-surface-2">
          <div
            ref={meterFillRef}
            className="absolute inset-x-0 bottom-0"
            style={{ height: '0%', backgroundColor: 'var(--color-meter-green)' }}
          />
        </div>
        <input
          type="range"
          min={-60}
          max={6}
          step={0.5}
          value={gainDb}
          onChange={(e) => onGainChange(Number(e.target.value))}
          className="h-32 w-6 accent-accent"
          style={{ writingMode: 'vertical-lr', direction: 'rtl' }}
          title={`${gainDb.toFixed(1)} dB`}
        />
      </div>
      <div className="tabular text-center text-[10px] text-ink-faint">{gainDb.toFixed(1)} dB</div>

      {trackId ? (
        // Real tracks: a compact insert summary — right-click a clip bar or
        // this pill both land on the same Sound tab (SoundPanel), so effects
        // editing has exactly one UI instead of a duplicated inline rack.
        <button
          type="button"
          onClick={openSoundTab}
          onContextMenu={(e) => {
            e.preventDefault();
            openSoundTab();
          }}
          className="label-mono truncate rounded border border-hairline bg-surface-1 px-1.5 py-1 text-center text-[10px] text-ink-dim hover:border-accent hover:text-accent"
          title="Open instrument & effects"
        >
          {effects[0] ? EFFECT_LABELS[effects[0].type] : '+ Insert'}
        </button>
      ) : (
        // The master bus has no track to select — its effects stay inline,
        // same as before.
        <EffectsRack
          effects={effects}
          onAdd={onAddEffect}
          onRemove={onRemoveEffect}
          onReorder={onReorderEffect}
          onUpdate={onUpdateEffect}
        />
      )}
    </div>
  );
}
