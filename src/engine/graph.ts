// Builds the full Tone.js node graph for a project: per-track source(s) ->
// insert effects -> gain -> pan -> master bus -> limiter -> destination.
// Used for BOTH live playback and offline bounce (Tone.Offline binds a new
// context as Tone's "current" context for the duration of its callback, so
// buildGraph just needs to be invoked inside that callback — it never
// touches Tone.setContext itself).
import * as Tone from 'tone';
import type { Clip, Project, Track, VolumeKeyframe } from '../state/types';
import { sampleVolumeAtTick, sortKeyframes, type VolumeCurve } from './automation';
import { buildEffectChain } from './effects';
import { createDrumVoice, createSampleDrumVoice, type DrumVoice } from './instruments/drumKit';
import { createSynthInstrument, type SynthInstrument } from './instruments/synthFactory';
import { getSampleBuffer, hasSampleBuffer } from './sampleRegistry';
import { clampSwing, patternLengthTicks, stepOffsetTicks, ticksToToneTime } from './time';

interface Disposable {
  dispose(): void;
}

export interface BuiltGraph {
  /** trackId -> laneId -> live voice, exposed so the step sequencer can preview a single hit. */
  drumVoicesByTrack: Map<string, Map<string, DrumVoice>>;
  /** trackId -> the track's live instrument, exposed so the piano roll can preview a note. */
  synthInstrumentsByTrack: Map<string, SynthInstrument>;
  /** trackId -> the pre-effects input gain, exposed so sessionPlayer can route an ad-hoc looping clip through the track's normal fader/pan/effects/mute/solo chain instead of bypassing it. */
  trackInputsByTrack: Map<string, Tone.Gain>;
  /** trackId -> a post-fader/pan meter tap, polled by AudioEngine's rAF loop for the mixer's level bars. */
  metersByTrack: Map<string, Tone.Meter>;
  /** Post-master-effects-chain tap (what's actually about to hit the destination). */
  masterMeter: Tone.Meter;
  parts: Tone.Part[];
  dispose(): void;
}

export interface BuildGraphOptions {
  /** False while Session view is the active main view — Timeline's absolute-tick Parts/Players are skipped so a session-launched loop on the same track can't double-trigger it. Defaults to true. */
  scheduleArrangement?: boolean;
}

export interface PatternStepEvent {
  time: string;
  laneId: string;
  velocity: number;
}

/** Flattens a pattern clip's "on" steps into swing/volume-adjusted trigger events. Shared by the Timeline's absolute-tick Part (buildPatternPart) and sessionPlayer.ts's ad-hoc looping Part — both need the exact same swing/velocity math, just different start/loop wiring. */
export function buildPatternEvents(clip: Extract<Clip, { kind: 'pattern' }>): PatternStepEvent[] {
  const events: PatternStepEvent[] = [];
  const swing = clampSwing(clip.pattern.swing);
  for (const lane of clip.pattern.lanes) {
    lane.steps.forEach((step, i) => {
      if (!step.on) return;
      const offset = stepOffsetTicks(i, swing);
      events.push({
        time: ticksToToneTime(offset),
        laneId: lane.laneId,
        velocity: step.velocity * sampleVolumeAtTick(clip.volumeKeyframes, offset, clip.volumeCurve),
      });
    });
  }
  return events;
}

export interface MidiNoteEvent {
  time: string;
  pitch: number;
  durationTicks: number;
  velocity: number;
}

/** Same sharing rationale as buildPatternEvents, for MIDI clips. */
export function buildMidiEvents(clip: Extract<Clip, { kind: 'midi' }>): MidiNoteEvent[] {
  return clip.notes.map((n) => ({
    time: ticksToToneTime(n.startTicks),
    pitch: n.pitch,
    durationTicks: n.durationTicks,
    velocity: n.velocity * sampleVolumeAtTick(clip.volumeKeyframes, n.startTicks, clip.volumeCurve),
  }));
}

function buildPatternPart(clip: Extract<Clip, { kind: 'pattern' }>, laneVoices: Map<string, DrumVoice>): Tone.Part {
  const part = new Tone.Part<PatternStepEvent>((time, ev) => {
    laneVoices.get(ev.laneId)?.trigger(time, ev.velocity);
  }, buildPatternEvents(clip));
  part.loop = true;
  part.loopEnd = ticksToToneTime(patternLengthTicks(clip.pattern.steps));
  part.start(ticksToToneTime(clip.startTicks));
  part.stop(ticksToToneTime(clip.startTicks + clip.lengthTicks));
  return part;
}

function buildMidiPart(clip: Extract<Clip, { kind: 'midi' }>, instrument: SynthInstrument): Tone.Part {
  const part = new Tone.Part<MidiNoteEvent>((time, ev) => {
    instrument.triggerNote(ev.pitch, ev.durationTicks, time, ev.velocity);
  }, buildMidiEvents(clip));
  part.start(ticksToToneTime(clip.startTicks));
  part.stop(ticksToToneTime(clip.startTicks + clip.lengthTicks));
  return part;
}

function buildTrackChannel(
  track: Track,
  anySolo: boolean,
  masterInput: Tone.ToneAudioNode,
  disposables: Disposable[],
): { trackInput: Tone.Gain; meter: Tone.Meter } {
  const trackInput = new Tone.Gain(1);
  const isSilenced = track.mixer.mute || (anySolo && !track.mixer.solo);
  const trackGain = new Tone.Gain(isSilenced ? 0 : Tone.dbToGain(track.mixer.gainDb));
  const trackPanner = new Tone.Panner(track.mixer.pan);
  const meter = new Tone.Meter({ smoothing: 0.8 });
  disposables.push(trackInput, trackGain, trackPanner, meter);

  const effectNodes = buildEffectChain(track.effects, trackInput, trackGain);
  disposables.push(...effectNodes);

  trackGain.connect(trackPanner);
  trackPanner.connect(masterInput);
  trackPanner.connect(meter); // tap only — doesn't join the audio path to master

  return { trackInput, meter };
}

function buildDrumTrack(
  track: Track,
  trackInput: Tone.Gain,
  disposables: Disposable[],
  parts: Tone.Part[],
  scheduleArrangement: boolean,
): Map<string, DrumVoice> {
  const laneVoices = new Map<string, DrumVoice>();

  for (const lane of track.drumKit ?? []) {
    const voice =
      lane.sampleRef && hasSampleBuffer(lane.sampleRef)
        ? createSampleDrumVoice(getSampleBuffer(lane.sampleRef)!)
        : createDrumVoice(lane.laneId);
    const laneGain = new Tone.Gain(lane.mute ? 0 : Tone.dbToGain(lane.gainDb));
    voice.output.connect(laneGain);
    laneGain.connect(trackInput);
    disposables.push(laneGain, voice);
    laneVoices.set(lane.laneId, voice);
  }

  if (scheduleArrangement) {
    for (const clip of track.clips) {
      if (clip.kind !== 'pattern') continue;
      parts.push(buildPatternPart(clip, laneVoices));
    }
  }

  return laneVoices;
}

// Web Audio's AudioParam has no native spline-ramp method — a 'spline'
// curve is approximated by sampling sampleVolumeAtTick (the exact same
// curve math used everywhere else) at this many short linear ramps per
// keyframe segment, reusing linearRampToValueAtTime for each sub-step. Low
// enough to be cheap, high enough that the ramp's steps aren't audible as
// zipper noise.
const SPLINE_SUBDIVISIONS_PER_SEGMENT = 8;

// Schedules a clip's volume-keyframe curve onto a live Gain param as
// absolute-tick automation events (Tone.Param.setValueAtTime/
// linearRampToValueAtTime resolve "Xi" tick notation against the Transport's
// own tempo-linked clock, same as every other scheduled time in this file —
// see time.ts's header comment — so this stays glitch-free across BPM
// changes too). Only audio clips get real continuous automation: they're
// the one clip kind with a single per-clip node sitting in the signal path
// the whole time it plays. Pattern/MIDI clips instead scale each discrete
// trigger's velocity by the curve's value at that instant (see
// buildPatternPart/buildMidiPart) since there's no per-clip node to ramp.
function scheduleVolumeAutomation(
  gainParam: Tone.Gain['gain'],
  keyframes: VolumeKeyframe[] | undefined,
  clipStartTicks: number,
  clipLengthTicks: number,
  curve: VolumeCurve = 'linear',
): void {
  if (!keyframes || keyframes.length === 0) return;
  const sorted = sortKeyframes(keyframes);
  const atClipTick = (ticks: number) => ticksToToneTime(clipStartTicks + ticks);
  gainParam.setValueAtTime(sorted[0]!.value, atClipTick(0));

  if (curve === 'spline') {
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i]!;
      const b = sorted[i + 1]!;
      for (let step = 1; step <= SPLINE_SUBDIVISIONS_PER_SEGMENT; step++) {
        const ticks = a.ticks + ((b.ticks - a.ticks) * step) / SPLINE_SUBDIVISIONS_PER_SEGMENT;
        gainParam.linearRampToValueAtTime(sampleVolumeAtTick(sorted, ticks, curve), atClipTick(ticks));
      }
    }
  } else {
    for (const kf of sorted) {
      gainParam.linearRampToValueAtTime(kf.value, atClipTick(kf.ticks));
    }
  }

  gainParam.setValueAtTime(sorted[sorted.length - 1]!.value, atClipTick(clipLengthTicks));
}

function buildAudioTrack(track: Track, trackInput: Tone.Gain, disposables: Disposable[], scheduleArrangement: boolean): void {
  if (!scheduleArrangement) return;
  for (const clip of track.clips) {
    if (clip.kind !== 'audio' || !hasSampleBuffer(clip.fileRef)) continue;
    const player = new Tone.Player(getSampleBuffer(clip.fileRef)!);
    player.volume.value = clip.gainDb;
    const clipGain = new Tone.Gain(1);
    scheduleVolumeAutomation(clipGain.gain, clip.volumeKeyframes, clip.startTicks, clip.lengthTicks, clip.volumeCurve);
    player.connect(clipGain);
    clipGain.connect(trackInput);
    disposables.push(player, clipGain);
    // .sync() binds start/stop to the Transport's own tick clock (like the
    // Part-based instruments above) instead of a one-off real-time offset
    // computed at graph-build time, so this stays glitch-free across BPM
    // changes the same way pattern/midi parts do.
    player.sync().start(ticksToToneTime(clip.startTicks), clip.bufferOffsetSec, ticksToToneTime(clip.lengthTicks));
  }
}

function buildSynthTrack(
  track: Track,
  trackInput: Tone.Gain,
  disposables: Disposable[],
  parts: Tone.Part[],
  scheduleArrangement: boolean,
): SynthInstrument | undefined {
  if (!track.instrument) return undefined;
  const instrument = createSynthInstrument(track.instrument);
  instrument.output.connect(trackInput);
  disposables.push(instrument);

  if (scheduleArrangement) {
    for (const clip of track.clips) {
      if (clip.kind !== 'midi') continue;
      parts.push(buildMidiPart(clip, instrument));
    }
  }

  return instrument;
}

export function buildGraph(project: Project, options: BuildGraphOptions = {}): BuiltGraph {
  const scheduleArrangement = options.scheduleArrangement ?? true;
  const disposables: Disposable[] = [];
  const parts: Tone.Part[] = [];
  const drumVoicesByTrack = new Map<string, Map<string, DrumVoice>>();
  const synthInstrumentsByTrack = new Map<string, SynthInstrument>();
  const trackInputsByTrack = new Map<string, Tone.Gain>();
  const metersByTrack = new Map<string, Tone.Meter>();

  const masterInput = new Tone.Gain(1);
  const masterGain = new Tone.Gain(Tone.dbToGain(project.masterGainDb));
  const masterOutput = new Tone.Gain(1);
  const masterMeter = new Tone.Meter({ smoothing: 0.8 });
  disposables.push(masterInput, masterGain, masterOutput, masterMeter);
  masterInput.connect(masterGain);

  const hasActiveLimiter = project.masterEffects.some((e) => e.type === 'limiter' && !e.bypass);
  const masterEffects = hasActiveLimiter
    ? project.masterEffects
    : [
        ...project.masterEffects,
        { id: 'implicit-limiter', type: 'limiter' as const, bypass: false, params: { threshold: -1 } },
      ];
  const masterEffectNodes = buildEffectChain(masterEffects, masterGain, masterOutput);
  disposables.push(...masterEffectNodes);
  masterOutput.connect(Tone.getDestination());
  masterOutput.connect(masterMeter);

  const anySolo = project.tracks.some((t) => t.mixer.solo);

  for (const track of project.tracks) {
    const { trackInput, meter } = buildTrackChannel(track, anySolo, masterInput, disposables);
    metersByTrack.set(track.id, meter);
    trackInputsByTrack.set(track.id, trackInput);

    if (track.kind === 'drum') {
      drumVoicesByTrack.set(track.id, buildDrumTrack(track, trackInput, disposables, parts, scheduleArrangement));
    } else if (track.kind === 'synth') {
      const instrument = buildSynthTrack(track, trackInput, disposables, parts, scheduleArrangement);
      if (instrument) synthInstrumentsByTrack.set(track.id, instrument);
    } else if (track.kind === 'audio') {
      buildAudioTrack(track, trackInput, disposables, scheduleArrangement);
    }
  }

  return {
    drumVoicesByTrack,
    synthInstrumentsByTrack,
    trackInputsByTrack,
    metersByTrack,
    masterMeter,
    parts,
    dispose() {
      parts.forEach((p) => p.dispose());
      disposables.forEach((d) => d.dispose());
    },
  };
}
