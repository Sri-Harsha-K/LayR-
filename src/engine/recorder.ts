// Mic capture for audio-track recording. Tone.Recorder wraps the browser's
// MediaRecorder API, which — per Tone's own docs — offers no sample-accurate
// start/stop. A recorded take lands wherever the transport's playhead
// happened to be when the recorder actually finished opening, which is
// "close enough" for punch-in style recording but will drift from the kind
// of tick-accurate sync the rest of this engine guarantees for parts/notes.
import * as Tone from 'tone';

class AudioRecorder {
  private mic: Tone.UserMedia | null = null;
  private recorder: Tone.Recorder | null = null;
  private waveform: Tone.Waveform | null = null;

  get isRecording(): boolean {
    return this.recorder !== null;
  }

  async start(): Promise<void> {
    if (this.recorder) return;
    const mic = new Tone.UserMedia();
    await mic.open();
    const recorder = new Tone.Recorder();
    // Fan-out tap for the Capture view's live waveform — doesn't join the
    // recorder's own signal path, same "tap, don't insert" pattern graph.ts
    // uses for meters.
    const waveform = new Tone.Waveform(256);
    mic.connect(recorder);
    mic.connect(waveform);
    await recorder.start();
    this.mic = mic;
    this.recorder = recorder;
    this.waveform = waveform;
  }

  /** Latest input waveform samples, for CaptureView's canvas draw. Null while not recording. */
  getWaveform(): Float32Array | null {
    return this.waveform ? (this.waveform.getValue() as Float32Array) : null;
  }

  async stop(): Promise<Blob | null> {
    const recorder = this.recorder;
    const mic = this.mic;
    const waveform = this.waveform;
    this.recorder = null;
    this.mic = null;
    this.waveform = null;
    if (!recorder) return null;
    const blob = await recorder.stop();
    recorder.dispose();
    waveform?.dispose();
    mic?.close();
    mic?.dispose();
    return blob;
  }
}

export const audioRecorder = new AudioRecorder();
