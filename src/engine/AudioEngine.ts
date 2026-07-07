// Public facade over the engine. React never touches Tone.js or the graph
// directly — it calls these commands and reads project state; high-frequency
// output (playhead, meters) flows back out through state/transient.ts via
// the rAF clock started in init().
import * as Tone from 'tone';
import type { Project } from '../state/types';
import { buildGraph, type BuiltGraph } from './graph';
import * as transport from './transport';
import { clampBpm } from './time';
import { setPlayhead, setTransportFlags } from '../state/transient';

function isOnlyBpmDifferent(a: Project, b: Project): boolean {
  return (
    a.tracks === b.tracks &&
    a.masterEffects === b.masterEffects &&
    a.masterGainDb === b.masterGainDb &&
    a.name === b.name &&
    a.bpm !== b.bpm
  );
}

class AudioEngine {
  private graph: BuiltGraph | null = null;
  private lastProject: Project | null = null;
  private initialized = false;
  private rafId: number | null = null;
  private unsubscribeTransportState: (() => void) | null = null;

  init(): void {
    if (this.initialized) return;
    this.initialized = true;
    transport.initTransport();

    this.unsubscribeTransportState = transport.subscribeTransportState((event) => {
      setTransportFlags(event === 'started', false);
    });

    const tick = () => {
      setPlayhead(transport.getPlayheadTicks());
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  /** Applies the latest project state to the audio graph. BPM-only changes never rebuild the graph. */
  applyProject(project: Project): void {
    if (this.lastProject && isOnlyBpmDifferent(this.lastProject, project)) {
      transport.setBpm(project.bpm);
      this.lastProject = project;
      return;
    }

    this.graph?.dispose();
    this.graph = buildGraph(project);
    transport.setBpmImmediate(clampBpm(project.bpm));
    this.lastProject = project;
  }

  async play(): Promise<void> {
    await Tone.start();
    transport.play();
  }

  pause(): void {
    transport.pause();
  }

  returnToZero(): void {
    transport.returnToZero();
  }

  setLoop(enabled: boolean, startTicks: number, endTicks: number): void {
    transport.setLoop(enabled, startTicks, endTicks);
  }

  setMetronomeEnabled(enabled: boolean): void {
    transport.setMetronomeEnabled(enabled);
  }

  /** Triggers a single drum lane immediately, for step-click preview and sample audition. */
  previewDrumLane(trackId: string, laneId: string, velocity = 0.9): void {
    const voice = this.graph?.drumVoicesByTrack.get(trackId)?.get(laneId);
    voice?.trigger(Tone.now(), velocity);
  }

  dispose(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.unsubscribeTransportState?.();
    transport.disposeMetronome();
    this.graph?.dispose();
    this.graph = null;
    this.initialized = false;
  }
}

export const audioEngine = new AudioEngine();
