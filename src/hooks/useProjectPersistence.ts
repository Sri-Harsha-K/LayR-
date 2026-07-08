import { useEffect } from 'react';
import { useProjectStore } from '../state/projectStore';
import { useUiStore } from '../state/uiStore';
import { autosaveNow, isProjectDirty, recoverAutosave } from '../engine/projectIO';

const AUTOSAVE_INTERVAL_MS = 15_000;

/** Wires crash-recovery, dirty tracking, and periodic autosave into the app root. Mirrors useAudioEngine.ts's thin-hook-over-module shape. */
export function useProjectPersistence() {
  useEffect(() => {
    void recoverAutosave();
  }, []);

  useEffect(() => {
    let lastProject = useProjectStore.getState().project;
    useUiStore.getState().setProjectDirty(isProjectDirty(lastProject));

    const unsubscribe = useProjectStore.subscribe((state) => {
      if (state.project !== lastProject) {
        lastProject = state.project;
        useUiStore.getState().setProjectDirty(isProjectDirty(lastProject));
      }
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      if (useUiStore.getState().isProjectDirty) void autosaveNow();
    }, AUTOSAVE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);
}
