// Synthesized default drum kit — no samples, no licensing, fully offline.
// Each lane is a small Tone.js voice graph tuned by ear. Every voice exposes
// a uniform trigger(time, velocity) so the sequencer (engine/graph.ts)
// doesn't need to know what's behind a lane.
import * as Tone from 'tone';

export interface DrumVoice {
  /** output node to connect into the lane's gain/mute stage */
  output: Tone.ToneAudioNode;
  trigger(time: number, velocity: number): void;
  dispose(): void;
}

function velocityGain(velocity: number, floor = 0.35): number {
  return floor + (1 - floor) * Math.max(0, Math.min(1, velocity));
}

function createKick(): DrumVoice {
  const synth = new Tone.MembraneSynth({
    pitchDecay: 0.04,
    octaves: 7,
    oscillator: { type: 'sine' },
    envelope: { attack: 0.001, decay: 0.4, sustain: 0, release: 0.4 },
  });
  const drive = new Tone.Distortion({ distortion: 0.05, wet: 0.15 });
  synth.connect(drive);
  return {
    output: drive,
    trigger(time, velocity) {
      synth.triggerAttackRelease('C1', 0.4, time, velocityGain(velocity, 0.5));
    },
    dispose() {
      synth.dispose();
      drive.dispose();
    },
  };
}

function createSnare(): DrumVoice {
  const noise = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.001, decay: 0.18, sustain: 0 },
  });
  const noiseFilter = new Tone.Filter({ type: 'highpass', frequency: 900, Q: 0.7 });
  noise.connect(noiseFilter);

  const body = new Tone.MembraneSynth({
    pitchDecay: 0.02,
    octaves: 3,
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.1 },
  });

  const bus = new Tone.Gain(1);
  noiseFilter.connect(bus);
  body.connect(bus);

  return {
    output: bus,
    trigger(time, velocity) {
      const v = velocityGain(velocity, 0.4);
      noise.triggerAttackRelease(0.18, time, v);
      body.triggerAttackRelease('G3', 0.1, time, v * 0.8);
    },
    dispose() {
      noise.dispose();
      noiseFilter.dispose();
      body.dispose();
      bus.dispose();
    },
  };
}

function createClap(): DrumVoice {
  const bus = new Tone.Gain(1);
  const filter = new Tone.Filter({ type: 'bandpass', frequency: 1100, Q: 1.2 });
  filter.connect(bus);

  const bursts = Array.from({ length: 3 }, () => {
    const noise = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.001, decay: 0.05, sustain: 0 },
    });
    noise.connect(filter);
    return noise;
  });
  const tail = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.001, decay: 0.22, sustain: 0 },
  });
  tail.connect(filter);

  return {
    output: bus,
    trigger(time, velocity) {
      const v = velocityGain(velocity, 0.45);
      bursts.forEach((burst, i) => burst.triggerAttackRelease(0.05, time + i * 0.012, v));
      tail.triggerAttackRelease(0.22, time + 0.03, v * 0.8);
    },
    dispose() {
      bursts.forEach((b) => b.dispose());
      tail.dispose();
      filter.dispose();
      bus.dispose();
    },
  };
}

function createHat(open: boolean): DrumVoice {
  const synth = new Tone.MetalSynth({
    harmonicity: 5.1,
    modulationIndex: 32,
    resonance: open ? 4000 : 5500,
    octaves: 1.5,
    envelope: {
      attack: 0.001,
      decay: open ? 0.35 : 0.05,
      release: open ? 0.35 : 0.05,
    },
  });
  const filter = new Tone.Filter({ type: 'highpass', frequency: 7000 });
  synth.connect(filter);

  return {
    output: filter,
    trigger(time, velocity) {
      synth.triggerAttackRelease('C6', open ? 0.35 : 0.05, time, velocityGain(velocity, 0.4));
    },
    dispose() {
      synth.dispose();
      filter.dispose();
    },
  };
}

function createTom(pitch: 'low' | 'mid'): DrumVoice {
  const synth = new Tone.MembraneSynth({
    pitchDecay: 0.06,
    octaves: 4,
    oscillator: { type: 'sine' },
    envelope: { attack: 0.001, decay: 0.35, sustain: 0.02, release: 0.4 },
  });
  const note = pitch === 'low' ? 'A1' : 'D2';
  return {
    output: synth,
    trigger(time, velocity) {
      synth.triggerAttackRelease(note, 0.4, time, velocityGain(velocity, 0.45));
    },
    dispose() {
      synth.dispose();
    },
  };
}

function createRim(): DrumVoice {
  const click = new Tone.Synth({
    oscillator: { type: 'square' },
    envelope: { attack: 0.0005, decay: 0.03, sustain: 0, release: 0.02 },
  });
  const filter = new Tone.Filter({ type: 'bandpass', frequency: 2200, Q: 2 });
  click.connect(filter);
  return {
    output: filter,
    trigger(time, velocity) {
      click.triggerAttackRelease('A5', 0.03, time, velocityGain(velocity, 0.5));
    },
    dispose() {
      click.dispose();
      filter.dispose();
    },
  };
}

const SAMPLE_VOICE_POOL_SIZE = 4;

/** A user sample lane: round-robins a small pool of Players so fast repeats don't cut each other off. */
export function createSampleDrumVoice(buffer: Tone.ToneAudioBuffer): DrumVoice {
  const bus = new Tone.Gain(1);
  const players = Array.from({ length: SAMPLE_VOICE_POOL_SIZE }, () => {
    const player = new Tone.Player(buffer);
    player.connect(bus);
    return player;
  });
  let nextVoice = 0;

  return {
    output: bus,
    trigger(time, velocity) {
      const player = players[nextVoice]!;
      nextVoice = (nextVoice + 1) % players.length;
      player.volume.value = Tone.gainToDb(velocityGain(velocity, 0.3));
      player.start(time);
    },
    dispose() {
      players.forEach((p) => p.dispose());
      bus.dispose();
    },
  };
}

export function createDrumVoice(laneId: string): DrumVoice {
  switch (laneId) {
    case 'kick':
      return createKick();
    case 'snare':
      return createSnare();
    case 'clap':
      return createClap();
    case 'closedHat':
      return createHat(false);
    case 'openHat':
      return createHat(true);
    case 'lowTom':
      return createTom('low');
    case 'midTom':
      return createTom('mid');
    case 'rim':
      return createRim();
    default:
      return createRim();
  }
}
