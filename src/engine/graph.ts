// Builds the full Tone.js node graph for a project: per-track source(s) ->
// insert effects -> gain -> pan -> master bus -> limiter -> destination.
// Used for BOTH live playback and offline bounce (Tone.Offline binds a new
// context as Tone's "current" context for the duration of its callback, so
// buildGraph just needs to be invoked inside that callback — it never
// touches Tone.setContext itself).
import * as Tone from 'tone';
import type { Clip, Project, Track } from '../state/types';
import { buildEffectChain } from './effects';
import { createDrumVoice, createSampleDrumVoice, type DrumVoice } from './instruments/drumKit';
import { getSampleBuffer, hasSampleBuffer } from './sampleRegistry';
import { clampSwing, patternLengthTicks, stepOffsetTicks, ticksToToneTime } from './time';

interface Disposable {
  dispose(): void;
}

export interface BuiltGraph {
  /** trackId -> laneId -> live voice, exposed so the step sequencer can preview a single hit. */
  drumVoicesByTrack: Map<string, Map<string, DrumVoice>>;
  parts: Tone.Part[];
  dispose(): void;
}

function buildPatternPart(clip: Extract<Clip, { kind: 'pattern' }>, laneVoices: Map<string, DrumVoice>): Tone.Part {
  interface StepEvent {
    time: string;
    laneId: string;
    velocity: number;
  }

  const events: StepEvent[] = [];
  const swing = clampSwing(clip.pattern.swing);
  for (const lane of clip.pattern.lanes) {
    lane.steps.forEach((step, i) => {
      if (!step.on) return;
      events.push({
        time: ticksToToneTime(stepOffsetTicks(i, swing)),
        laneId: lane.laneId,
        velocity: step.velocity,
      });
    });
  }

  const part = new Tone.Part<StepEvent>((time, ev) => {
    laneVoices.get(ev.laneId)?.trigger(time, ev.velocity);
  }, events);
  part.loop = true;
  part.loopEnd = ticksToToneTime(patternLengthTicks(clip.pattern.steps));
  part.start(ticksToToneTime(clip.startTicks));
  part.stop(ticksToToneTime(clip.startTicks + clip.lengthTicks));
  return part;
}

function buildTrackChannel(
  track: Track,
  anySolo: boolean,
  masterInput: Tone.ToneAudioNode,
  disposables: Disposable[],
): Tone.Gain {
  const trackInput = new Tone.Gain(1);
  const isSilenced = track.mixer.mute || (anySolo && !track.mixer.solo);
  const trackGain = new Tone.Gain(isSilenced ? 0 : Tone.dbToGain(track.mixer.gainDb));
  const trackPanner = new Tone.Panner(track.mixer.pan);
  disposables.push(trackInput, trackGain, trackPanner);

  const effectNodes = buildEffectChain(track.effects, trackInput, trackGain);
  disposables.push(...effectNodes);

  trackGain.connect(trackPanner);
  trackPanner.connect(masterInput);

  return trackInput;
}

function buildDrumTrack(
  track: Track,
  trackInput: Tone.Gain,
  disposables: Disposable[],
  parts: Tone.Part[],
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

  for (const clip of track.clips) {
    if (clip.kind !== 'pattern') continue;
    parts.push(buildPatternPart(clip, laneVoices));
  }

  return laneVoices;
}

export function buildGraph(project: Project): BuiltGraph {
  const disposables: Disposable[] = [];
  const parts: Tone.Part[] = [];
  const drumVoicesByTrack = new Map<string, Map<string, DrumVoice>>();

  const masterInput = new Tone.Gain(1);
  const masterGain = new Tone.Gain(Tone.dbToGain(project.masterGainDb));
  disposables.push(masterInput, masterGain);
  masterInput.connect(masterGain);

  const hasActiveLimiter = project.masterEffects.some((e) => e.type === 'limiter' && !e.bypass);
  const masterEffects = hasActiveLimiter
    ? project.masterEffects
    : [
        ...project.masterEffects,
        { id: 'implicit-limiter', type: 'limiter' as const, bypass: false, params: { threshold: -1 } },
      ];
  const masterEffectNodes = buildEffectChain(masterEffects, masterGain, Tone.getDestination());
  disposables.push(...masterEffectNodes);

  const anySolo = project.tracks.some((t) => t.mixer.solo);

  for (const track of project.tracks) {
    const trackInput = buildTrackChannel(track, anySolo, masterInput, disposables);

    if (track.kind === 'drum') {
      drumVoicesByTrack.set(track.id, buildDrumTrack(track, trackInput, disposables, parts));
    }
    // synth clips (Phase 2) and audio clips (Phase 4) are scheduled here once
    // their instrument/player factories exist.
  }

  return {
    drumVoicesByTrack,
    parts,
    dispose() {
      parts.forEach((p) => p.dispose());
      disposables.forEach((d) => d.dispose());
    },
  };
}
