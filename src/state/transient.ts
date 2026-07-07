// High-frequency engine -> UI data that must NOT go through React state:
// playhead position and meter levels. The engine writes here on every
// scheduler tick / analyser frame; components read it inside a rAF loop and
// write directly to the DOM/canvas. See AudioEngine.ts and the performance
// notes in the project brief for why this is a hard rule.

export interface TransientState {
  playheadTicks: number;
  isPlaying: boolean;
  isRecording: boolean;
  /** trackId -> peak level in [0,1], updated every meter frame */
  meterLevels: Record<string, number>;
  masterMeterLevel: number;
}

const state: TransientState = {
  playheadTicks: 0,
  isPlaying: false,
  isRecording: false,
  meterLevels: {},
  masterMeterLevel: 0,
};

export function getTransientState(): Readonly<TransientState> {
  return state;
}

export function setPlayhead(ticks: number): void {
  state.playheadTicks = ticks;
}

export function setTransportFlags(isPlaying: boolean, isRecording: boolean): void {
  state.isPlaying = isPlaying;
  state.isRecording = isRecording;
}

export function setMeterLevel(trackId: string, level: number): void {
  state.meterLevels[trackId] = level;
}

export function clearMeterLevel(trackId: string): void {
  delete state.meterLevels[trackId];
}

export function setMasterMeterLevel(level: number): void {
  state.masterMeterLevel = level;
}
