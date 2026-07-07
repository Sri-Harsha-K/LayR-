// Thin wrapper around Tone's lookahead Transport: play/pause/loop/metronome
// and BPM changes. Nothing here ever uses setTimeout for musical events —
// everything goes through Tone.getTransport()'s own scheduler so it stays
// sample-accurate and glitch-free across BPM changes (see time.ts for why
// tick-notation ("Ni") scheduling survives tempo changes without a rebuild).
import * as Tone from 'tone';
import { BEATS_PER_BAR, PPQ, TICKS_PER_BEAT, clampBpm, ticksToToneTime } from './time';

let ppqConfigured = false;
let metronomeVoice: Tone.MembraneSynth | null = null;
let metronomeEventId: number | null = null;

export function initTransport(): void {
  if (ppqConfigured) return;
  Tone.getTransport().PPQ = PPQ;
  ppqConfigured = true;
}

export function play(): void {
  const transport = Tone.getTransport();
  if (transport.state !== 'started') transport.start();
}

export function pause(): void {
  const transport = Tone.getTransport();
  if (transport.state === 'started') transport.pause();
}

export function returnToZero(): void {
  Tone.getTransport().position = 0;
}

export function isPlaying(): boolean {
  return Tone.getTransport().state === 'started';
}

export function getPlayheadTicks(): number {
  return Tone.getTransport().ticks;
}

export function setBpm(bpm: number, rampSeconds = 0.05): void {
  Tone.getTransport().bpm.rampTo(clampBpm(bpm), rampSeconds);
}

export function setBpmImmediate(bpm: number): void {
  Tone.getTransport().bpm.value = clampBpm(bpm);
}

export function setLoop(enabled: boolean, startTicks: number, endTicks: number): void {
  const transport = Tone.getTransport();
  if (endTicks > startTicks) {
    transport.setLoopPoints(ticksToToneTime(startTicks), ticksToToneTime(endTicks));
  }
  transport.loop = enabled;
}

function ensureMetronomeVoice(): Tone.MembraneSynth {
  metronomeVoice ??= new Tone.MembraneSynth({
    pitchDecay: 0.008,
    octaves: 2,
    envelope: { attack: 0.001, decay: 0.06, sustain: 0, release: 0.02 },
  }).toDestination();
  metronomeVoice.volume.value = -8;
  return metronomeVoice;
}

/** Metronome bypasses the project mixer entirely — it's a transport concern, not project content. */
export function setMetronomeEnabled(enabled: boolean): void {
  const transport = Tone.getTransport();
  if (enabled && metronomeEventId === null) {
    const voice = ensureMetronomeVoice();
    // Anchor at tick 0 (not the default "now") so the click always lands on
    // the true beat grid even when the metronome is toggled on mid-playback.
    metronomeEventId = transport.scheduleRepeat(
      (time) => {
        const beatInBar = Math.floor(transport.getTicksAtTime(time) / TICKS_PER_BEAT) % BEATS_PER_BAR;
        const isDownbeat = beatInBar === 0;
        voice.triggerAttackRelease(isDownbeat ? 'C6' : 'C5', 0.05, time, isDownbeat ? 1 : 0.65);
      },
      '4n',
      0,
    );
  } else if (!enabled && metronomeEventId !== null) {
    transport.clear(metronomeEventId);
    metronomeEventId = null;
  }
}

export type TransportStateEvent = 'started' | 'stopped' | 'paused';

export function subscribeTransportState(callback: (event: TransportStateEvent) => void): () => void {
  const transport = Tone.getTransport();
  const onStart = () => callback('started');
  const onStop = () => callback('stopped');
  const onPause = () => callback('paused');
  transport.on('start', onStart);
  transport.on('stop', onStop);
  transport.on('pause', onPause);
  return () => {
    transport.off('start', onStart);
    transport.off('stop', onStop);
    transport.off('pause', onPause);
  };
}

export function disposeMetronome(): void {
  if (metronomeEventId !== null) {
    Tone.getTransport().clear(metronomeEventId);
    metronomeEventId = null;
  }
  metronomeVoice?.dispose();
  metronomeVoice = null;
}
