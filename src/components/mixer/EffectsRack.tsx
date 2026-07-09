import { useState } from 'react';
import { EFFECT_DEFAULT_PARAMS } from '../../engine/effects';
import { generateId } from '../../utils/id';
import type { EffectInstance, EffectType } from '../../state/types';
import { EFFECT_FIELDS, EFFECT_LABELS, EFFECT_TYPES } from './effectFields';

interface EffectsRackProps {
  effects: EffectInstance[];
  onAdd: (effect: EffectInstance) => void;
  onRemove: (effectId: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onUpdate: (effectId: string, patch: Partial<EffectInstance>) => void;
}

export function EffectsRack({ effects, onAdd, onRemove, onReorder, onUpdate }: EffectsRackProps) {
  const [pendingType, setPendingType] = useState<EffectType | ''>('');

  const handleAdd = (type: EffectType) => {
    onAdd({ id: generateId('fx'), type, bypass: false, params: { ...EFFECT_DEFAULT_PARAMS[type] } });
    setPendingType('');
  };

  return (
    <div className="flex flex-col gap-1.5">
      {effects.map((fx, index) => (
        <div key={fx.id} className="rounded border border-hairline bg-surface-1 p-1.5">
          <div className="flex items-center gap-1">
            <span className={['flex-1 text-xs', fx.bypass ? 'text-ink-faint line-through' : 'text-ink'].join(' ')}>
              {EFFECT_LABELS[fx.type]}
            </span>
            <button
              type="button"
              title="Move up"
              disabled={index === 0}
              onClick={() => onReorder(index, index - 1)}
              className="h-4 w-4 text-[10px] leading-none text-ink-faint hover:text-ink disabled:opacity-30"
            >
              ▲
            </button>
            <button
              type="button"
              title="Move down"
              disabled={index === effects.length - 1}
              onClick={() => onReorder(index, index + 1)}
              className="h-4 w-4 text-[10px] leading-none text-ink-faint hover:text-ink disabled:opacity-30"
            >
              ▼
            </button>
            <button
              type="button"
              title="Bypass"
              aria-pressed={fx.bypass}
              onClick={() => onUpdate(fx.id, { bypass: !fx.bypass })}
              className={[
                'h-4 w-4 rounded-sm border text-[9px] leading-none',
                fx.bypass ? 'border-meter-amber text-meter-amber' : 'border-hairline text-ink-faint hover:text-ink',
              ].join(' ')}
            >
              B
            </button>
            <button
              type="button"
              title="Remove"
              onClick={() => onRemove(fx.id)}
              className="h-4 w-4 text-[10px] leading-none text-ink-faint hover:text-record"
            >
              ✕
            </button>
          </div>

          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
            {EFFECT_FIELDS[fx.type].map((field) => {
              const raw = fx.params[field.key];
              if (field.kind === 'select') {
                const value = typeof raw === 'string' ? raw : field.options[0]!;
                return (
                  <label key={field.key} className="flex items-center gap-1 text-[10px] text-ink-faint">
                    {field.label}
                    <select
                      value={value}
                      onChange={(e) => onUpdate(fx.id, { params: { ...fx.params, [field.key]: e.target.value } })}
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
              const value = typeof raw === 'number' ? raw : field.min;
              return (
                <label key={field.key} className="flex items-center gap-1 text-[10px] text-ink-faint">
                  {field.label}
                  <input
                    type="range"
                    min={field.min}
                    max={field.max}
                    step={field.step}
                    value={value}
                    onChange={(e) => onUpdate(fx.id, { params: { ...fx.params, [field.key]: Number(e.target.value) } })}
                    className="w-16 accent-accent"
                  />
                  <span className="tabular w-10 text-right">
                    {value}
                    {field.unit ?? ''}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      ))}

      <select
        value={pendingType}
        onChange={(e) => handleAdd(e.target.value as EffectType)}
        className="rounded border border-dashed border-hairline bg-transparent px-1.5 py-1 text-xs text-ink-dim hover:border-accent hover:text-accent"
      >
        <option value="" disabled>
          + Add effect
        </option>
        {EFFECT_TYPES.map((type) => (
          <option key={type} value={type}>
            {EFFECT_LABELS[type]}
          </option>
        ))}
      </select>
    </div>
  );
}
