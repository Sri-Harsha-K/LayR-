import { create } from 'zustand';
import { TICKS_PER_BAR } from '../engine/time';

export type BottomPanelTab = 'stepsequencer' | 'pianoroll' | 'mixer' | 'sound';
export type MainView = 'timeline' | 'session';

export interface Selection {
  trackId?: string;
  clipId?: string;
}

interface UiState {
  selection: Selection;
  bottomPanelTab: BottomPanelTab;
  /** Timeline (linear arrangement) vs Session (clip launcher) — mutually exclusive playback scheduling, see engine/sessionPlayer.ts. */
  mainView: MainView;
  pxPerBeat: number; // horizontal zoom for the arrangement view
  loopEnabled: boolean;
  loopStartTicks: number;
  loopEndTicks: number;
  /** True until the user manually drags a loop range on the ruler — while true, useAudioEngine.ts keeps loopEndTicks tracking the furthest clip end across the whole project. */
  loopFollowsArrangement: boolean;
  metronomeEnabled: boolean;
  isPoweredOn: boolean; // AudioContext resumed via the power-on overlay

  /** Electron: the real .dawproj folder path. Browser: an opaque key into browser.ts's directory-handle cache. Undefined = never saved/opened ("Save" behaves like "Save As"). */
  openProjectRef?: string;
  isProjectDirty: boolean;

  selectTrack: (trackId: string | undefined) => void;
  selectClip: (trackId: string | undefined, clipId: string | undefined) => void;
  setBottomPanelTab: (tab: BottomPanelTab) => void;
  setMainView: (view: MainView) => void;
  setPxPerBeat: (px: number) => void;
  setLoopEnabled: (enabled: boolean) => void;
  /** Manual override (ruler drag) — also stops loopEndTicks from auto-following the arrangement. */
  setLoopRange: (startTicks: number, endTicks: number) => void;
  /** Internal: applies the auto-follow-computed range without touching loopFollowsArrangement. */
  setLoopRangeAuto: (startTicks: number, endTicks: number) => void;
  setLoopFollowsArrangement: (follows: boolean) => void;
  setMetronomeEnabled: (enabled: boolean) => void;
  powerOn: () => void;
  setOpenProjectRef: (ref: string | undefined) => void;
  setProjectDirty: (dirty: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  selection: {},
  bottomPanelTab: 'stepsequencer',
  mainView: 'timeline',
  pxPerBeat: 32,
  // A step sequencer's whole point is looping playback, so loop defaults on
  // over a 1-bar window — exactly the span of a freshly-added pattern clip
  // (addDefaultPatternClip). "Add a drum track" -> program steps -> Play
  // should loop immediately with no extra clicks.
  loopEnabled: true,
  loopStartTicks: 0,
  loopEndTicks: TICKS_PER_BAR,
  loopFollowsArrangement: true,
  metronomeEnabled: false,
  isPoweredOn: false,
  openProjectRef: undefined,
  isProjectDirty: false,

  selectTrack: (trackId) => set({ selection: { trackId } }),
  selectClip: (trackId, clipId) => set({ selection: { trackId, clipId } }),
  setBottomPanelTab: (tab) => set({ bottomPanelTab: tab }),
  setMainView: (view) => set({ mainView: view }),
  setPxPerBeat: (px) => set({ pxPerBeat: Math.max(4, Math.min(400, px)) }),
  setLoopEnabled: (enabled) => set({ loopEnabled: enabled }),
  setLoopRange: (startTicks, endTicks) =>
    set({ loopStartTicks: startTicks, loopEndTicks: endTicks, loopFollowsArrangement: false }),
  setLoopRangeAuto: (startTicks, endTicks) => set({ loopStartTicks: startTicks, loopEndTicks: endTicks }),
  setLoopFollowsArrangement: (follows) => set({ loopFollowsArrangement: follows }),
  setMetronomeEnabled: (enabled) => set({ metronomeEnabled: enabled }),
  powerOn: () => set({ isPoweredOn: true }),
  setOpenProjectRef: (ref) => set({ openProjectRef: ref }),
  setProjectDirty: (dirty) => set({ isProjectDirty: dirty }),
}));
