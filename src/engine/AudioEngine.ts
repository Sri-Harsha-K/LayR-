// Public facade over the engine. React never touches Tone.js or the graph
// directly — it calls these commands and reads project state; high-frequency
// output (playhead, meters) flows back out through state/transient.ts via
// the rAF clock started in init().
import * as Tone from 'tone';
import type { Project } from '../state/types';
import { buildGraph, type BuiltGraph } from './graph';
import * as transport from './transport';
import { clampBpm } from './time';
import { diffProject } from './projectDiff';
import { audioRecorder } from './recorder';
import { createDrumVoice } from './instruments/drumKit';
import {
  getTransientState,
  setMasterMeterLevel,
  setMeterLevel,
  setPlayhead,
  setRecordingWaveform,
  setTransportFlags,
} from '../state/transient';

/** Tone.Meter reports dBFS (-Infinity..0); the mixer just wants a 0..1 bar height. */
function dbToUnit(db: number): number {
  if (!Number.isFinite(db)) return 0;
  return Math.max(0, Math.min(1, (db + 60) / 60));
}

class AudioEngine {
  private graph: BuiltGraph | null = null;
  private lastProject: Project | null = null;
  private sessionMode = false;
  private initialized = false;
  private rafId: number | null = null;
  private unsubscribeTransportState: (() => void) | null = null;

  init(): void {
    if (this.initialized) return;
    this.initialized = true;
    transport.initTransport();

    this.unsubscribeTransportState = transport.subscribeTransportState((event) => {
      // isRecording is independent of play/pause/stop (see startRecording/
      // stopRecording) — only the isPlaying bit changes here.
      setTransportFlags(event === 'started', getTransientState().isRecording);
    });

    const tick = () => {
      setPlayhead(transport.getPlayheadTicks());
      if (this.graph) {
        this.graph.metersByTrack.forEach((meter, trackId) => {
          setMeterLevel(trackId, dbToUnit(meter.getValue() as number));
        });
        setMasterMeterLevel(dbToUnit(this.graph.masterMeter.getValue() as number));
      }
      setRecordingWaveform(audioRecorder.isRecording ? audioRecorder.getWaveform() : null);
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  /**
   * Applies the latest project state to the audio graph. Most changes just
   * ramp/patch the existing nodes in place (see engine/projectDiff.ts) —
   * only structural changes (tracks, clips, effect chains, instrument
   * engine/preset swaps) tear down and rebuild.
   */
  applyProject(project: Project): void {
    const prev = this.lastProject;
    this.lastProject = project;

    if (!prev) {
      this.rebuild(project);
      return;
    }

    const diff = diffProject(prev, project);
    switch (diff.kind) {
      case 'none':
        return;
      case 'bpm':
        transport.setBpm(diff.bpm);
        return;
      case 'instrument-params': {
        const track = project.tracks.find((t) => t.id === diff.trackId);
        const instrument = this.graph?.synthInstrumentsByTrack.get(diff.trackId);
        if (track?.instrument && instrument) {
          instrument.setParams(track.instrument);
        } else {
          this.rebuild(project);
        }
        return;
      }
      case 'rebuild':
        this.rebuild(project);
        return;
    }
  }

  private rebuild(project: Project): void {
    this.graph?.dispose();
    this.graph = buildGraph(project, { scheduleArrangement: !this.sessionMode });
    transport.setBpmImmediate(clampBpm(project.bpm));
  }

  /**
   * Timeline and Session are mutually exclusive schedulers on one shared
   * Transport (see engine/sessionPlayer.ts) — switching pauses playback and
   * rebuilds the graph so the Timeline's absolute-tick Parts/Players are
   * skipped while Session is active (and restored when leaving it), so a
   * track can never be double-triggered by both at once.
   */
  setSessionMode(enabled: boolean): void {
    if (this.sessionMode === enabled) return;
    this.sessionMode = enabled;
    transport.pause();
    if (this.lastProject) this.rebuild(this.lastProject);
  }

  /** Live per-track resources for sessionPlayer.ts to launch ad-hoc loops through — never used by React directly. */
  getDrumVoices(trackId: string) {
    return this.graph?.drumVoicesByTrack.get(trackId);
  }

  getSynthInstrument(trackId: string) {
    return this.graph?.synthInstrumentsByTrack.get(trackId);
  }

  getTrackInput(trackId: string) {
    return this.graph?.trackInputsByTrack.get(trackId);
  }

  async play(): Promise<void> {
    await Tone.start();
    transport.play();
  }

  pause(): void {
    transport.pause();
  }

  /** Halts playback and resets the playhead to tick 0 — unlike pause() (holds position) or returnToZero() alone (seeks without stopping if already playing), Stop always does both together. */
  stop(): void {
    transport.pause();
    transport.returnToZero();
  }

  returnToZero(): void {
    transport.returnToZero();
  }

  seekTo(ticks: number): void {
    transport.seekToTicks(ticks);
  }

  setLoop(enabled: boolean, startTicks: number, endTicks: number): void {
    transport.setLoop(enabled, startTicks, endTicks);
  }

  setMetronomeEnabled(enabled: boolean): void {
    transport.setMetronomeEnabled(enabled);
  }

  /**
   * Opens the mic and starts capturing, punching in playback if the
   * transport isn't already rolling. Returns the transport tick position at
   * the moment capture actually began, for placing the resulting clip — see
   * engine/recorder.ts for why this is "close enough," not sample-accurate.
   * One button (Record) owns start/stop of a take; Play/Stop is independent
   * and does NOT end an in-progress recording.
   */
  async startRecording(): Promise<number> {
    await Tone.start();
    transport.play();
    await audioRecorder.start();
    setTransportFlags(transport.isPlaying(), true);
    return transport.getPlayheadTicks();
  }

  /** Stops capture and returns the recorded take, or null if nothing was recording. */
  async stopRecording(): Promise<Blob | null> {
    const blob = await audioRecorder.stop();
    setTransportFlags(transport.isPlaying(), false);
    return blob;
  }

  /** Triggers a single drum lane immediately, for step-click preview and sample audition. */
  previewDrumLane(trackId: string, laneId: string, velocity = 0.9): void {
    const voice = this.graph?.drumVoicesByTrack.get(trackId)?.get(laneId);
    voice?.trigger(Tone.now(), velocity);
  }

  /** Triggers a short preview note (an eighth note's worth of ticks) on a synth track's live instrument. */
  previewSynthNote(trackId: string, pitch: number, velocity = 0.9): void {
    const PREVIEW_DURATION_TICKS = 480; // eighth note at 960 PPQ
    const instrument = this.graph?.synthInstrumentsByTrack.get(trackId);
    instrument?.triggerNote(pitch, PREVIEW_DURATION_TICKS, Tone.now(), velocity);
  }

  /** Auditions one of the built-in synthesized drum-kit sounds from the Library tab, with no track/lane involved — a throwaway voice straight to the destination, disposed after it's done ringing out. */
  previewBuiltInDrumSound(laneId: string): void {
    const voice = createDrumVoice(laneId);
    voice.output.toDestination();
    voice.trigger(Tone.now(), 0.9);
    setTimeout(() => voice.dispose(), 1500);
  }

  dispose(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.unsubscribeTransportState?.();
    transport.disposeMetronome();
    if (audioRecorder.isRecording) void audioRecorder.stop(); // release the mic rather than leave it open
    this.graph?.dispose();
    this.graph = null;
    this.initialized = false;
  }
}

export const audioEngine = new AudioEngine();
