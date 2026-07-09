import { useEffect } from 'react';
import { useProjectStore } from '../../state/projectStore';
import { useUiStore } from '../../state/uiStore';
import * as sessionPlayer from '../../engine/sessionPlayer';
import { useSessionActiveClip } from '../../hooks/useSessionActiveClip';
import type { Clip, Track } from '../../state/types';

const CELL_HEIGHT = 56;
const CELL_WIDTH = 132;

function ClipCell({ track, clip }: { track: Track; clip: Clip }) {
  const selectClip = useUiStore((s) => s.selectClip);
  const setBottomPanelTab = useUiStore((s) => s.setBottomPanelTab);
  const activeClipId = useSessionActiveClip(track.id);
  const isActive = activeClipId === clip.id;

  const label = clip.name ?? (clip.kind === 'pattern' ? 'Pattern' : clip.kind === 'midi' ? 'MIDI' : 'Audio');

  return (
    <button
      type="button"
      onClick={() => void sessionPlayer.launchClip(track.id, clip)}
      onContextMenu={(e) => {
        e.preventDefault();
        selectClip(track.id, clip.id);
        setBottomPanelTab('sound');
      }}
      title={`${label} — click to launch, right-click for instrument & effects`}
      className={[
        'flex items-center gap-1.5 truncate rounded border px-2 text-left text-xs transition-colors',
        isActive ? 'border-accent bg-accent/20 text-accent' : 'border-hairline text-ink hover:border-ink-faint',
      ].join(' ')}
      style={{ height: CELL_HEIGHT - 8, borderLeftWidth: 3, borderLeftColor: track.color }}
    >
      <span aria-hidden>▶</span>
      <span className="truncate">{label}</span>
    </button>
  );
}

function EmptyCell({ track, sceneId }: { track: Track; sceneId: string }) {
  const addDefaultPatternClip = useProjectStore((s) => s.addDefaultPatternClip);
  const addDefaultMidiClip = useProjectStore((s) => s.addDefaultMidiClip);
  const setClipScene = useProjectStore((s) => s.setClipScene);

  if (track.kind === 'audio') {
    return <div className="flex items-center justify-center text-ink-faint" style={{ height: CELL_HEIGHT - 8 }}>–</div>;
  }

  const handleAdd = () => {
    const clipId = track.kind === 'drum' ? addDefaultPatternClip(track.id) : addDefaultMidiClip(track.id);
    setClipScene(track.id, clipId, sceneId);
  };

  return (
    <button
      type="button"
      onClick={handleAdd}
      title="Add a clip to this scene"
      className="flex items-center justify-center rounded border border-dashed border-hairline text-ink-faint hover:border-accent hover:text-accent"
      style={{ height: CELL_HEIGHT - 8 }}
    >
      +
    </button>
  );
}

function TrackColumnHeader({ track }: { track: Track }) {
  return (
    <div
      className="flex shrink-0 items-center gap-1.5 border-b border-hairline px-2 py-2"
      style={{ width: CELL_WIDTH, borderTop: `3px solid ${track.color}` }}
    >
      <span className="truncate text-xs text-ink">{track.name}</span>
      <button
        type="button"
        onClick={() => sessionPlayer.stopTrack(track.id)}
        title="Stop this track"
        className="ml-auto h-4 w-4 shrink-0 rounded-sm border border-hairline text-[9px] leading-none text-ink-faint hover:border-record hover:text-record"
      >
        ■
      </button>
    </div>
  );
}

function SceneRow({ scenes, sceneIndex, tracks }: { scenes: { id: string; name: string }[]; sceneIndex: number; tracks: Track[] }) {
  const scene = scenes[sceneIndex]!;
  const renameScene = useProjectStore((s) => s.renameScene);
  const removeScene = useProjectStore((s) => s.removeScene);

  return (
    <div className="flex">
      {tracks.map((track) => {
        const clip = track.clips.find((c) => c.sceneId === scene.id);
        return (
          <div key={track.id} className="shrink-0 border-b border-hairline p-1" style={{ width: CELL_WIDTH, height: CELL_HEIGHT }}>
            {clip ? <ClipCell track={track} clip={clip} /> : <EmptyCell track={track} sceneId={scene.id} />}
          </div>
        );
      })}
      <div className="flex shrink-0 items-center gap-1 border-b border-hairline p-1" style={{ width: CELL_WIDTH, height: CELL_HEIGHT }}>
        <button
          type="button"
          onClick={() => void sessionPlayer.launchScene(scene.id)}
          title="Launch this scene"
          className="flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-hairline text-[9px] text-ink-faint hover:border-accent hover:text-accent"
        >
          ▶
        </button>
        <input
          type="text"
          value={scene.name}
          onChange={(e) => renameScene(scene.id, e.target.value)}
          className="min-w-0 flex-1 truncate bg-transparent text-xs text-ink-dim outline-none focus:text-ink"
        />
        <button
          type="button"
          onClick={() => removeScene(scene.id)}
          title="Remove scene"
          className="h-4 w-4 shrink-0 text-[10px] leading-none text-ink-faint hover:text-record"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

export function SessionView() {
  const tracks = useProjectStore((s) => s.project.tracks);
  const scenes = useProjectStore((s) => s.project.scenes);
  const addScene = useProjectStore((s) => s.addScene);

  // Session and Timeline are mutually exclusive schedulers on one shared
  // Transport (see engine/AudioEngine.setSessionMode) — entering this view
  // is what flips the engine into session mode; leaving it (unmount)
  // restores Timeline scheduling and tears down any active launches.
  useEffect(() => {
    sessionPlayer.setSessionMode(true);
    return () => sessionPlayer.setSessionMode(false);
  }, []);

  if (tracks.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-ink-faint">
        Add a track to start launching clips.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-hairline bg-surface-1 px-3 py-1.5 text-xs text-ink-dim">
        <span className="label-mono text-ink-faint">Session</span>
        <span>Launch quantize: 1 Bar</span>
      </div>
      <div className="flex-1 overflow-auto">
        <div className="flex">
          {tracks.map((t) => (
            <TrackColumnHeader key={t.id} track={t} />
          ))}
          <div className="label-mono flex shrink-0 items-center border-b border-hairline px-2 py-2 text-ink-faint" style={{ width: CELL_WIDTH }}>
            Scenes
          </div>
        </div>
        {scenes.map((_, i) => (
          <SceneRow key={scenes[i]!.id} scenes={scenes} sceneIndex={i} tracks={tracks} />
        ))}
        <div className="p-2">
          <button
            type="button"
            onClick={() => addScene()}
            className="rounded-md border border-dashed border-hairline px-3 py-1.5 text-xs text-ink-dim hover:border-accent hover:text-accent"
          >
            + Scene
          </button>
        </div>
      </div>
    </div>
  );
}
