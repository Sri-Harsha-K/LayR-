import { useProjectStore } from '../../state/projectStore';
import { ChannelStrip } from './ChannelStrip';

export function Mixer() {
  const tracks = useProjectStore((s) => s.project.tracks);
  const masterGainDb = useProjectStore((s) => s.project.masterGainDb);
  const masterEffects = useProjectStore((s) => s.project.masterEffects);
  const setMasterGainDb = useProjectStore((s) => s.setMasterGainDb);
  const updateTrackMixer = useProjectStore((s) => s.updateTrackMixer);
  const addTrackEffect = useProjectStore((s) => s.addTrackEffect);
  const removeTrackEffect = useProjectStore((s) => s.removeTrackEffect);
  const reorderTrackEffects = useProjectStore((s) => s.reorderTrackEffects);
  const updateTrackEffect = useProjectStore((s) => s.updateTrackEffect);
  const addMasterEffect = useProjectStore((s) => s.addMasterEffect);
  const removeMasterEffect = useProjectStore((s) => s.removeMasterEffect);
  const reorderMasterEffects = useProjectStore((s) => s.reorderMasterEffects);
  const updateMasterEffect = useProjectStore((s) => s.updateMasterEffect);

  if (tracks.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-ink-faint">
        Add a track to see it in the mixer.
      </div>
    );
  }

  return (
    <div className="flex h-full gap-0 overflow-x-auto">
      {tracks.map((track) => (
        <ChannelStrip
          key={track.id}
          trackId={track.id}
          title={track.name}
          color={track.color}
          gainDb={track.mixer.gainDb}
          onGainChange={(db) => updateTrackMixer(track.id, { gainDb: db })}
          pan={track.mixer.pan}
          onPanChange={(pan) => updateTrackMixer(track.id, { pan })}
          mute={track.mixer.mute}
          onMuteToggle={() => updateTrackMixer(track.id, { mute: !track.mixer.mute })}
          solo={track.mixer.solo}
          onSoloToggle={() => updateTrackMixer(track.id, { solo: !track.mixer.solo })}
          effects={track.effects}
          onAddEffect={(fx) => addTrackEffect(track.id, fx)}
          onRemoveEffect={(fxId) => removeTrackEffect(track.id, fxId)}
          onReorderEffect={(from, to) => reorderTrackEffects(track.id, from, to)}
          onUpdateEffect={(fxId, patch) => updateTrackEffect(track.id, fxId, patch)}
        />
      ))}
      <ChannelStrip
        title="Master"
        gainDb={masterGainDb}
        onGainChange={setMasterGainDb}
        effects={masterEffects}
        onAddEffect={addMasterEffect}
        onRemoveEffect={removeMasterEffect}
        onReorderEffect={reorderMasterEffects}
        onUpdateEffect={updateMasterEffect}
      />
    </div>
  );
}
