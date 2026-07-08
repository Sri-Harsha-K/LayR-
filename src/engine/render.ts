// Offline bounce-to-WAV. Thin wrapper around graph.ts per its own header
// comment: buildGraph relies on Tone's "current context" convention, and
// Tone.Offline swaps that context for the duration of its callback, so the
// exact same graph builder serves both live playback and this render.
import * as Tone from 'tone';
import { platform } from '../platform';
import type { Project } from '../state/types';
import { furthestClipEndTicks } from '../state/projectStore';
import { buildGraph, type BuiltGraph } from './graph';
import { PPQ, ticksToSeconds } from './time';
import { encodeWav } from './wavEncoder';

// Effect release tails (reverb/delay) can ring past the last clip's end.
// Rather than computing an exact per-effect tail length, pad the render
// window by a flat amount — deliberately approximate, documented here.
const RELEASE_TAIL_SECONDS = 1;
const MIN_DURATION_SECONDS = 1;

function projectDurationSeconds(project: Project): number {
  const lastTick = furthestClipEndTicks(project.tracks);
  return Math.max(MIN_DURATION_SECONDS, ticksToSeconds(lastTick, project.bpm) + RELEASE_TAIL_SECONDS);
}

/** Renders the full project (every track/clip, respecting mute/solo/effects) to 16-bit PCM WAV bytes. */
export async function renderProjectToWav(project: Project): Promise<Uint8Array<ArrayBuffer>> {
  const duration = projectDurationSeconds(project);
  let built: BuiltGraph | undefined;

  // The callback only *sets up* scheduling — it must NOT wait on anything
  // driven by the offline clock (e.g. a Transport.scheduleOnce firing at
  // `duration`), because Tone doesn't advance that clock until *after* this
  // callback resolves and Offline calls context.render() internally. `render()`
  // is what actually plays the scheduled `duration` seconds; the callback's
  // job is just "build the graph and start the transport," synchronously.
  const rendered = await Tone.Offline(() => {
    // initTransport()'s PPQ-set is guarded by a module-level flag and so is
    // NOT idempotent across contexts (see transport.ts) — set it directly
    // on this offline context's transport instead of calling initTransport().
    Tone.getTransport().PPQ = PPQ;
    built = buildGraph(project);
    Tone.getTransport().start(0);
  }, duration);

  built?.dispose();
  return encodeWav(rendered);
}

// Module-level guard (not per-caller state) so the Bounce button and its
// Ctrl/Cmd+E keyboard shortcut can't both kick off an overlapping render —
// Tone.Offline is heavy enough that a second concurrent render is worth
// preventing outright rather than just debouncing the UI.
let bounceInFlight = false;

/** Renders and hands the WAV bytes to the platform's save-file prompt. Returns false if a bounce was already running or the user cancelled the save dialog. */
export async function bounceProject(project: Project): Promise<boolean> {
  if (bounceInFlight) return false;
  bounceInFlight = true;
  try {
    const bytes = await renderProjectToWav(project);
    return await platform.exportWav(bytes, project.name);
  } finally {
    bounceInFlight = false;
  }
}
