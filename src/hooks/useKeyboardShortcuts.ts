import { useEffect } from 'react';
import { useUiStore } from '../state/uiStore';
import { useProjectStore } from '../state/projectStore';
import { audioEngine } from '../engine/AudioEngine';
import { isPlaying as engineIsPlaying } from '../engine/transport';

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
}

/**
 * Global shortcuts. Transport/undo shortcuts are added as their backing
 * systems land (Phase 1: play/pause, return-to-zero, loop, undo/redo,
 * mute/solo selected track); save/bounce/duplicate/delete arrive with
 * persistence and arrangement editing in Phase 5.
 */
export function useKeyboardShortcuts() {
  const setBottomPanelTab = useUiStore((s) => s.setBottomPanelTab);
  const setLoopEnabled = useUiStore((s) => s.setLoopEnabled);

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
        case ' ':
          e.preventDefault();
          if (engineIsPlaying()) audioEngine.pause();
          else void audioEngine.play();
          break;
        case 'Enter':
          audioEngine.returnToZero();
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
        default:
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setBottomPanelTab, setLoopEnabled]);
}
