import { useEffect } from 'react';
import { useUiStore } from '../state/uiStore';
import { useProjectStore } from '../state/projectStore';
import { audioEngine } from '../engine/AudioEngine';
import { isPlaying as engineIsPlaying } from '../engine/transport';
import { toggleRecording } from '../engine/recordingController';
import { openProject, saveProject, saveProjectAs } from '../engine/projectIO';
import { getTransientState } from '../state/transient';

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
}

/**
 * Global shortcuts. Transport/undo shortcuts are added as their backing
 * systems land (Phase 1: play/pause, return-to-zero, loop, undo/redo,
 * mute/solo selected track; Phase 5: save/save-as/open/bounce, and clip
 * duplicate/delete/split — the last three act on uiStore's selected clip,
 * 'x' additionally requires the playhead to fall inside it).
 */
export function useKeyboardShortcuts() {
  const setBottomPanelTab = useUiStore((s) => s.setBottomPanelTab);
  const setLoopEnabled = useUiStore((s) => s.setLoopEnabled);
  const setExportDialogOpen = useUiStore((s) => s.setExportDialogOpen);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;

      const isMod = e.metaKey || e.ctrlKey;

      if (isMod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        const temporal = useProjectStore.temporal.getState();
        if (e.shiftKey) temporal.redo();
        else temporal.undo();
        return;
      }

      if (isMod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (e.shiftKey) void saveProjectAs();
        else void saveProject();
        return;
      }

      if (isMod && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        void openProject();
        return;
      }

      // Browsers intercept Ctrl/Cmd+N for "new window" before page JS ever
      // sees it — this only fires in Electron, where there's no such
      // conflict. The Start screen's button still works everywhere either way.
      if (isMod && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        const trackId = useProjectStore.getState().addTrack('drum');
        const clipId = useProjectStore.getState().addDefaultPatternClip(trackId);
        useUiStore.getState().selectClip(trackId, clipId);
        setBottomPanelTab('stepsequencer');
        return;
      }

      if (isMod && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        setExportDialogOpen(true);
        return;
      }

      if (isMod && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        const { selection } = useUiStore.getState();
        if (selection.trackId && selection.clipId) {
          const newClipId = useProjectStore.getState().duplicateClip(selection.trackId, selection.clipId);
          if (newClipId) useUiStore.getState().selectClip(selection.trackId, newClipId);
        }
        return;
      }

      if (isMod || e.altKey) return;

      switch (e.key) {
        case '1':
          setBottomPanelTab('stepsequencer');
          break;
        case '2':
          setBottomPanelTab('pianoroll');
          break;
        case '3':
          setBottomPanelTab('mixer');
          break;
        case '4':
          setBottomPanelTab('sound');
          break;
        case '5':
          setBottomPanelTab('library');
          break;
        case ' ':
          e.preventDefault();
          if (engineIsPlaying()) audioEngine.pause();
          else void audioEngine.play();
          break;
        case 'Enter':
        case '0':
          audioEngine.returnToZero();
          break;
        case 'Escape':
          audioEngine.stop();
          break;
        case 'r':
        case 'R':
          void toggleRecording();
          break;
        case 'l':
        case 'L':
          setLoopEnabled(!useUiStore.getState().loopEnabled);
          break;
        case 'm':
        case 'M': {
          const { selection } = useUiStore.getState();
          if (!selection.trackId) break;
          const track = useProjectStore.getState().project.tracks.find((t) => t.id === selection.trackId);
          if (track) useProjectStore.getState().updateTrackMixer(track.id, { mute: !track.mixer.mute });
          break;
        }
        case 's':
        case 'S': {
          const { selection } = useUiStore.getState();
          if (!selection.trackId) break;
          const track = useProjectStore.getState().project.tracks.find((t) => t.id === selection.trackId);
          if (track) useProjectStore.getState().updateTrackMixer(track.id, { solo: !track.mixer.solo });
          break;
        }
        case 'Delete':
        case 'Backspace': {
          const { selection } = useUiStore.getState();
          if (!selection.trackId || !selection.clipId) break;
          useProjectStore.getState().removeClip(selection.trackId, selection.clipId);
          useUiStore.getState().selectClip(selection.trackId, undefined);
          break;
        }
        case 'x':
        case 'X': {
          const { selection } = useUiStore.getState();
          if (!selection.trackId || !selection.clipId) break;
          const track = useProjectStore.getState().project.tracks.find((t) => t.id === selection.trackId);
          const clip = track?.clips.find((c) => c.id === selection.clipId);
          if (!clip || clip.kind === 'pattern') break;
          const playheadTicks = getTransientState().playheadTicks;
          if (playheadTicks <= clip.startTicks || playheadTicks >= clip.startTicks + clip.lengthTicks) break;
          useProjectStore.getState().splitClip(selection.trackId, selection.clipId, playheadTicks);
          break;
        }
        default:
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setBottomPanelTab, setLoopEnabled, setExportDialogOpen]);
}
