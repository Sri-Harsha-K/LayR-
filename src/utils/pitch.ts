const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const BLACK_KEY_CLASSES = new Set([1, 3, 6, 8, 10]);

function pitchClass(pitch: number): number {
  return ((pitch % 12) + 12) % 12;
}

export function midiToNoteName(pitch: number): string {
  const octave = Math.floor(pitch / 12) - 1;
  return `${NOTE_NAMES[pitchClass(pitch)]}${octave}`;
}

export function isBlackKey(pitch: number): boolean {
  return BLACK_KEY_CLASSES.has(pitchClass(pitch));
}

export function isC(pitch: number): boolean {
  return pitchClass(pitch) === 0;
}
