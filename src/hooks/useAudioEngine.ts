import { useEffect } from 'react';
import { audioEngine } from '../engine/AudioEngine';
import { useProjectStore } from '../state/projectStore';
import { useUiStore } from '../state/uiStore';

/** Wires the Zustand stores to the audio engine. Mounted once at the app root. */
export function useAudioEngine() {
  useEffect(() => {
    audioEngine.init();

    let lastProject = useProjectStore.getState().project;
    audioEngine.applyProject(lastProject);

    const unsubscribeProject = useProjectStore.subscribe((state) => {
      if (state.project !== lastProject) {
        lastProject = state.project;
        audioEngine.applyProject(lastProject);
      }
    });

    return () => {
      unsubscribeProject();
      audioEngine.dispose();
    };
  }, []);

  useEffect(() => {
    let last = useUiStore.getState();
    audioEngine.setLoop(last.loopEnabled, last.loopStartTicks, last.loopEndTicks);
    audioEngine.setMetronomeEnabled(last.metronomeEnabled);

    const unsubscribe = useUiStore.subscribe((state) => {
      if (
        state.loopEnabled !== last.loopEnabled ||
        state.loopStartTicks !== last.loopStartTicks ||
        state.loopEndTicks !== last.loopEndTicks
      ) {
        audioEngine.setLoop(state.loopEnabled, state.loopStartTicks, state.loopEndTicks);
      }
      if (state.metronomeEnabled !== last.metronomeEnabled) {
        audioEngine.setMetronomeEnabled(state.metronomeEnabled);
      }
      last = state;
    });

    return unsubscribe;
  }, []);
}
