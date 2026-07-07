import { useEffect } from 'react';
import { useUiStore } from '../state/uiStore';

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
}

/**
 * Global shortcuts that don't depend on the audio engine (bottom-panel tabs).
 * Transport/undo/save/export shortcuts are wired in once those systems exist
 * (Phase 1+) to avoid dead keybindings.
 */
export function useKeyboardShortcuts() {
  const setBottomPanelTab = useUiStore((s) => s.setBottomPanelTab);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;

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
        default:
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setBottomPanelTab]);
}
