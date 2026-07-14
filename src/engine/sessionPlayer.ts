// Session view's clip launcher — a second scheduler, mutually exclusive with
// the Timeline's absolute-tick Parts/Players (see AudioEngine.setSessionMode
// and graph.ts's BuildGraphOptions.scheduleArrangement). Launching a clip
// here builds an ad-hoc *looping* Part/Player starting at the next bar
// boundary, reusing the track's already-live instrument/drum-voices/
// trackInput from AudioEngine's accessors rather than owning any audio nodes
// of its own — this module only ever creates the one-off Part/Player for the
// duration of a launch, never a second copy of the instrument itself.
//
// Like recordingController.ts, this is a deliberate bridge module allowed to
// touch both AudioEngine (for live nodes) and the project/UI stores (for
// clip/scene data and transport state) — the same seam recordingController.ts
// documents for the same reason.
import * as Tone from 'tone';
import { audioEngine } from './AudioEngine';
import { buildMidiEvents, buildPatternEvents, type MidiNoteEvent, type PatternStepEvent } from './graph';
import { getSampleBuffer } from './sampleRegistry';
import { effectiveSpeed } from './speed';
import { buildSpeedWarp } from './speedAutomation';
import * as transport from './transport';
import { patternLengthTicks, ticksToToneTime, TICKS_PER_BAR } from './time';
import { useProjectStore } from '../state/projectStore';
import { clearSessionActiveClips, setSessionActiveClip } from '../state/transient';
import type { Clip } from '../state/types';

interface ActiveLaunch {
  clipId: string;
  /** Schedules a stop + node disposal at a future tick — used when something else launches on the same track. */
  stopAt(atTick: number): void;
  /** Tears the node down right now, no scheduling — used only when leaving Session mode entirely. */
  disposeNow(): void;
}

const activeByTrack = new Map<string, ActiveLaunch>();

function nextBarTick(): number {
  const current = transport.getPlayheadTicks();
  return Math.ceil(current / TICKS_PER_BAR) * TICKS_PER_BAR;
}

function launchPattern(trackId: string, clip: Extract<Clip, { kind: 'pattern' }>, atTick: number, warp: (t: number) => number): ActiveLaunch | null {
  const laneVoices = audioEngine.getDrumVoices(trackId);
  if (!laneVoices) return null;
  const part = new Tone.Part<PatternStepEvent>((time, ev) => {
    laneVoices.get(ev.laneId)?.trigger(time, ev.velocity);
  }, buildPatternEvents(clip, warp));
  part.loop = true;
  part.loopEnd = ticksToToneTime(warp(patternLengthTicks(clip.pattern.steps)));
  part.start(ticksToToneTime(atTick));
  return {
    clipId: clip.id,
    stopAt(atStopTick) {
      part.stop(ticksToToneTime(atStopTick));
      Tone.getTransport().scheduleOnce(() => part.dispose(), ticksToToneTime(atStopTick));
    },
    disposeNow() {
      part.stop();
      part.dispose();
    },
  };
}

function launchMidi(trackId: string, clip: Extract<Clip, { kind: 'midi' }>, atTick: number, warp: (t: number) => number): ActiveLaunch | null {
  const instrument = audioEngine.getSynthInstrument(trackId);
  if (!instrument) return null;
  const part = new Tone.Part<MidiNoteEvent>((time, ev) => {
    instrument.triggerNote(ev.pitch, ev.durationTicks, time, ev.velocity);
  }, buildMidiEvents(clip, warp));
  part.loop = true;
  part.loopEnd = ticksToToneTime(warp(clip.lengthTicks));
  part.start(ticksToToneTime(atTick));
  return {
    clipId: clip.id,
    stopAt(atStopTick) {
      part.stop(ticksToToneTime(atStopTick));
      Tone.getTransport().scheduleOnce(() => part.dispose(), ticksToToneTime(atStopTick));
    },
    disposeNow() {
      part.stop();
      part.dispose();
    },
  };
}

function launchAudio(trackId: string, clip: Extract<Clip, { kind: 'audio' }>, atTick: number, speed: number): ActiveLaunch | null {
  const trackInput = audioEngine.getTrackInput(trackId);
  const buffer = getSampleBuffer(clip.fileRef);
  if (!trackInput || !buffer) return null;
  const player = new Tone.Player(buffer);
  player.loop = true;
  player.loopStart = clip.bufferOffsetSec;
  player.volume.value = clip.gainDb;
  // Audio speed rides playbackRate (pitch shifts) — same as the Timeline's
  // buildAudioTrack; the loop itself keeps its own real-time length, just
  // consumed faster.
  player.playbackRate = speed;
  player.connect(trackInput);
  // Audio content plays back at its own fixed real-time duration regardless
  // of project BPM (same as Timeline audio clips in graph.ts) — .sync() only
  // ties the *start* to the transport's tick clock so it still lands on the
  // quantized boundary.
  player.sync().start(ticksToToneTime(atTick), clip.bufferOffsetSec);
  return {
    clipId: clip.id,
    stopAt(atStopTick) {
      player.unsync();
      player.stop(ticksToToneTime(atStopTick));
      Tone.getTransport().scheduleOnce(() => player.dispose(), ticksToToneTime(atStopTick));
    },
    disposeNow() {
      player.unsync();
      player.stop();
      player.dispose();
    },
  };
}

// Session playback stacks all three levels: clip * track * scene (the scene a
// clip is launched from). Timeline playback (graph.ts) uses only clip * track,
// since there's no scene context there. Pattern/MIDI get a full time-warp (so
// a per-clip speed *curve* works exactly as it does on the Timeline); audio
// stays on a single playbackRate scalar (no continuous rate automation).
function buildLaunch(trackId: string, clip: Clip, atTick: number): ActiveLaunch | null {
  const project = useProjectStore.getState().project;
  const track = project.tracks.find((t) => t.id === trackId);
  const scene = clip.sceneId ? project.scenes.find((s) => s.id === clip.sceneId) : undefined;
  const outerSpeed = effectiveSpeed(track?.speed, scene?.speed);

  if (clip.kind === 'audio') {
    return launchAudio(trackId, clip, atTick, effectiveSpeed(clip.speed, track?.speed, scene?.speed));
  }
  const warp = buildSpeedWarp({
    speedKeyframes: clip.speedKeyframes,
    speedCurve: clip.speedCurve,
    clipScalarSpeed: clip.speed,
    outerSpeed,
    domainTicks: clip.kind === 'pattern' ? patternLengthTicks(clip.pattern.steps) : clip.lengthTicks,
  });
  if (clip.kind === 'pattern') return launchPattern(trackId, clip, atTick, warp);
  return launchMidi(trackId, clip, atTick, warp);
}

function stopTrackAt(trackId: string, atTick: number): void {
  const active = activeByTrack.get(trackId);
  if (active) {
    active.stopAt(atTick);
    activeByTrack.delete(trackId);
  }
  Tone.getTransport().scheduleOnce(() => setSessionActiveClip(trackId, undefined), ticksToToneTime(atTick));
}

/** Launches a clip on its track, quantized to the next bar. Stops whatever was already looping on that track at the same boundary (one clip per track, per the mock's per-column exclusivity). */
export async function launchClip(trackId: string, clip: Clip): Promise<void> {
  await Tone.start();
  if (!transport.isPlaying()) transport.play();
  const atTick = nextBarTick();
  stopTrackAt(trackId, atTick);
  const launch = buildLaunch(trackId, clip, atTick);
  if (launch) {
    activeByTrack.set(trackId, launch);
    Tone.getTransport().scheduleOnce(() => setSessionActiveClip(trackId, clip.id), ticksToToneTime(atTick));
  }
}

/** Stops whatever is looping on a track, quantized to the next bar. */
export function stopTrack(trackId: string): void {
  stopTrackAt(trackId, nextBarTick());
}

/** Launches every track's clip tagged with this scene, best-effort simultaneous (each computes the same quantized boundary). Tracks with no clip in this scene are left alone. */
export async function launchScene(sceneId: string): Promise<void> {
  await Tone.start();
  if (!transport.isPlaying()) transport.play();
  const atTick = nextBarTick();
  const tracks = useProjectStore.getState().project.tracks;
  for (const track of tracks) {
    const clip = track.clips.find((c) => c.sceneId === sceneId);
    if (!clip) continue;
    stopTrackAt(track.id, atTick);
    const launch = buildLaunch(track.id, clip, atTick);
    if (launch) {
      activeByTrack.set(track.id, launch);
      Tone.getTransport().scheduleOnce(() => setSessionActiveClip(track.id, clip.id), ticksToToneTime(atTick));
    }
  }
}

/** Immediate teardown of every active launch, no quantizing — only called when leaving Session mode entirely. */
export function stopAll(): void {
  activeByTrack.forEach((launch) => launch.disposeNow());
  activeByTrack.clear();
  clearSessionActiveClips();
}

/** Wraps AudioEngine.setSessionMode with sessionPlayer's own cleanup — call this from the Session view's mount/unmount rather than the two separately. */
export function setSessionMode(enabled: boolean): void {
  audioEngine.setSessionMode(enabled);
  if (!enabled) stopAll();
}
