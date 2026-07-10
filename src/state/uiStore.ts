import { create } from 'zustand';
import { TICKS_PER_BAR } from '../engine/time';

export type BottomPanelTab = 'stepsequencer' | 'pianoroll' | 'mixer' | 'sound' | 'library';
export type MainView = 'timeline' | 'session';

export interface Selection {
  trackId?: string;
  clipId?: string;
}

/** A pending bulk-delete confirmation (Clear Tracks / Clear Pattern / Clear MIDI) — null when no dialog is showing. */
export interface ConfirmRequest {
  message: string;
  onConfirm: () => void;
}

interface UiState {
  selection: Selection;
  bottomPanelTab: BottomPanelTab;
  /** Timeline (linear arrangement) vs Session (clip launcher) — mutually exclusive playback scheduling, see engine/sessionPlayer.ts. */
  mainView: MainView;
  isExportDialogOpen: boolean;
  /** Set by requestConfirm to show ConfirmDialog.tsx; null = no dialog showing. */
  confirmRequest: ConfirmRequest | null;
  /** User-facing error surfaced by Toast.tsx — e.g. save/open/export failures that would otherwise fail silently. Null = no toast shown. */
  toastMessage: string | null;
  pxPerBeat: number; // horizontal zoom for the arrangement view
  loopEnabled: boolean;
  loopStartTicks: number;
  loopEndTicks: number;
  /** True until the user manually drags a loop range on the ruler — while true, useAudioEngine.ts keeps loopEndTicks tracking the furthest clip end across the whole project. */
  loopFollowsArrangement: boolean;
  metronomeEnabled: boolean;
  isPoweredOn: boolean; // AudioContext resumed via the power-on overlay

  /** Track rail width in px, drag-resizable via the ResizeHandle between it and the main view. */
  trackRailWidth: number;
  /** BottomDock height in px, drag-resizable via the ResizeHandle above it. */
  bottomDockHeight: number;

  /** Electron: the real .dawproj folder path. Browser: an opaque key into browser.ts's directory-handle cache. Undefined = never saved/opened ("Save" behaves like "Save As"). */
  openProjectRef?: string;
  isProjectDirty: boolean;

  selectTrack: (trackId: string | undefined) => void;
  selectClip: (trackId: string | undefined, clipId: string | undefined) => void;
  setBottomPanelTab: (tab: BottomPanelTab) => void;
  setMainView: (view: MainView) => void;
  setExportDialogOpen: (open: boolean) => void;
  /** Shows ConfirmDialog.tsx with `message`; `onConfirm` runs once the user clicks the destructive action, then the dialog closes itself. */
  requestConfirm: (message: string, onConfirm: () => void) => void;
  cancelConfirm: () => void;
  setToast: (message: string | null) => void;
  setPxPerBeat: (px: number) => void;
  setLoopEnabled: (enabled: boolean) => void;
  /** Manual override (ruler drag) — also stops loopEndTicks from auto-following the arrangement. */
  setLoopRange: (startTicks: number, endTicks: number) => void;
  /** Internal: applies the auto-follow-computed range without touching loopFollowsArrangement. */
  setLoopRangeAuto: (startTicks: number, endTicks: number) => void;
  setLoopFollowsArrangement: (follows: boolean) => void;
  setMetronomeEnabled: (enabled: boolean) => void;
  /** Adds a delta (px, from ResizeHandle) rather than setting an absolute value — clamps to a sane range. */
  resizeTrackRail: (deltaPx: number) => void;
  resizeBottomDock: (deltaPx: number) => void;
  powerOn: () => void;
  setOpenProjectRef: (ref: string | undefined) => void;
  setProjectDirty: (dirty: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  selection: {},
  bottomPanelTab: 'stepsequencer',
  mainView: 'timeline',
  isExportDialogOpen: false,
  confirmRequest: null,
  toastMessage: null,
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
  trackRailWidth: 224, // matches the old fixed w-56
  bottomDockHeight: 256, // matches the old fixed h-64
  openProjectRef: undefined,
  isProjectDirty: false,

  selectTrack: (trackId) => set({ selection: { trackId } }),
  selectClip: (trackId, clipId) => set({ selection: { trackId, clipId } }),
  setBottomPanelTab: (tab) => set({ bottomPanelTab: tab }),
  setMainView: (view) => set({ mainView: view }),
  setExportDialogOpen: (open) => set({ isExportDialogOpen: open }),
  requestConfirm: (message, onConfirm) => set({ confirmRequest: { message, onConfirm } }),
  cancelConfirm: () => set({ confirmRequest: null }),
  setToast: (message) => set({ toastMessage: message }),
  setPxPerBeat: (px) => set({ pxPerBeat: Math.max(4, Math.min(400, px)) }),
  setLoopEnabled: (enabled) => set({ loopEnabled: enabled }),
  setLoopRange: (startTicks, endTicks) =>
    set({ loopStartTicks: startTicks, loopEndTicks: endTicks, loopFollowsArrangement: false }),
  setLoopRangeAuto: (startTicks, endTicks) => set({ loopStartTicks: startTicks, loopEndTicks: endTicks }),
  setLoopFollowsArrangement: (follows) => set({ loopFollowsArrangement: follows }),
  setMetronomeEnabled: (enabled) => set({ metronomeEnabled: enabled }),
  // Dragging the handle right grows the rail; dragging the one above
  // BottomDock down shrinks it (the boundary moves toward BottomDock's own
  // content) — opposite signs are intentional, not a copy-paste slip.
  resizeTrackRail: (deltaPx) =>
    set((s) => ({ trackRailWidth: Math.max(160, Math.min(420, s.trackRailWidth + deltaPx)) })),
  resizeBottomDock: (deltaPx) =>
    set((s) => ({ bottomDockHeight: Math.max(140, Math.min(520, s.bottomDockHeight - deltaPx)) })),
  powerOn: () => set({ isPoweredOn: true }),
  setOpenProjectRef: (ref) => set({ openProjectRef: ref }),
  setProjectDirty: (dirty) => set({ isProjectDirty: dirty }),
}));
