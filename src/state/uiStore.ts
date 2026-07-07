import { create } from 'zustand';

export type BottomPanelTab = 'stepsequencer' | 'pianoroll' | 'mixer';

export interface Selection {
  trackId?: string;
  clipId?: string;
}

interface UiState {
  selection: Selection;
  bottomPanelTab: BottomPanelTab;
  pxPerBeat: number; // horizontal zoom for the arrangement view
  loopEnabled: boolean;
  loopStartTicks: number;
  loopEndTicks: number;
  metronomeEnabled: boolean;
  isPoweredOn: boolean; // AudioContext resumed via the power-on overlay

  selectTrack: (trackId: string | undefined) => void;
  selectClip: (trackId: string | undefined, clipId: string | undefined) => void;
  setBottomPanelTab: (tab: BottomPanelTab) => void;
  setPxPerBeat: (px: number) => void;
  setLoopEnabled: (enabled: boolean) => void;
  setLoopRange: (startTicks: number, endTicks: number) => void;
  setMetronomeEnabled: (enabled: boolean) => void;
  powerOn: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  selection: {},
  bottomPanelTab: 'stepsequencer',
  pxPerBeat: 32,
  loopEnabled: false,
  loopStartTicks: 0,
  loopEndTicks: 960 * 4 * 4, // 4 bars default
  metronomeEnabled: false,
  isPoweredOn: false,

  selectTrack: (trackId) => set({ selection: { trackId } }),
  selectClip: (trackId, clipId) => set({ selection: { trackId, clipId } }),
  setBottomPanelTab: (tab) => set({ bottomPanelTab: tab }),
  setPxPerBeat: (px) => set({ pxPerBeat: Math.max(4, Math.min(400, px)) }),
  setLoopEnabled: (enabled) => set({ loopEnabled: enabled }),
  setLoopRange: (startTicks, endTicks) => set({ loopStartTicks: startTicks, loopEndTicks: endTicks }),
  setMetronomeEnabled: (enabled) => set({ metronomeEnabled: enabled }),
  powerOn: () => set({ isPoweredOn: true }),
}));
