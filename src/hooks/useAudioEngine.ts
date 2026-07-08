import { useEffect } from 'react';
import { audioEngine } from '../engine/AudioEngine';
import { furthestClipEndTicks, useProjectStore } from '../state/projectStore';
import { useUiStore } from '../state/uiStore';
import { TICKS_PER_BAR } from '../engine/time';
import type { Project } from '../state/types';

/**
 * Keeps the loop range spanning the whole arrangement (0 -> furthest clip
 * end across every track) until the user manually drags a custom range on
 * the ruler (ArrangementView's Ruler calls uiStore.setLoopRange, which
 * flips loopFollowsArrangement off) — otherwise a loop stays stuck at
 * whatever it defaulted to as more clips/tracks get added.
 */
function applyAutoLoopRange(project: Project): void {
  if (!useUiStore.getState().loopFollowsArrangement) return;
  const furthest = furthestClipEndTicks(project.tracks);
  useUiStore.getState().setLoopRangeAuto(0, Math.max(furthest, TICKS_PER_BAR));
}

/** Wires the Zustand stores to the audio engine. Mounted once at the app root. */
export function useAudioEngine() {
  useEffect(() => {
    audioEngine.init();

    let lastProject = useProjectStore.getState().project;
    audioEngine.applyProject(lastProject);
    applyAutoLoopRange(lastProject);

    const unsubscribeProject = useProjectStore.subscribe((state) => {
      if (state.project !== lastProject) {
        lastProject = state.project;
        audioEngine.applyProject(lastProject);
        applyAutoLoopRange(lastProject);
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
