// Orchestrates one recording take: finds the armed audio track, starts/stops
// mic capture via AudioEngine, and on stop decodes the take and drops it
// into the project as a new audio clip. AudioEngine itself never touches the
// project store (see its own header comment) — this module is the one
// bridge between the two, shared by the transport bar's Record button and
// the "R" keyboard shortcut so both stay in sync.
import { useProjectStore } from '../state/projectStore';
import { generateId } from '../utils/id';
import { audioEngine } from './AudioEngine';
import { registerSample } from './sampleRegistry';
import { secondsToTicks } from './time';
import type { Clip, Track } from '../state/types';

let session: { trackId: string; startTicks: number } | null = null;

export function findArmedAudioTrack(): Track | undefined {
  return useProjectStore.getState().project.tracks.find((t) => t.kind === 'audio' && t.armed);
}

export async function toggleRecording(): Promise<void> {
  if (session) {
    const { trackId, startTicks } = session;
    session = null;
    const blob = await audioEngine.stopRecording();
    if (!blob) return;

    const arrayBuffer = await blob.arrayBuffer();
    const { ref, durationSeconds } = await registerSample('Recording', arrayBuffer);
    const bpm = useProjectStore.getState().project.bpm;
    const clip: Clip = {
      id: generateId('clip'),
      startTicks,
      lengthTicks: Math.max(1, Math.round(secondsToTicks(durationSeconds, bpm))),
      kind: 'audio',
      fileRef: ref,
      bufferOffsetSec: 0,
      gainDb: 0,
    };
    useProjectStore.getState().addClip(trackId, clip);
    return;
  }

  const track = findArmedAudioTrack();
  if (!track) return;
  try {
    const startTicks = await audioEngine.startRecording();
    session = { trackId: track.id, startTicks };
  } catch (err) {
    // getUserMedia legitimately rejects on permission denial or no device —
    // this is an expected external-boundary failure, not a bug. Session
    // stays null so the button reverts to its non-recording state.
    console.error('Could not start recording (mic permission denied or no input device):', err);
  }
}
