const A4_MIDI = 69;
const LETTERS = ['C', 'C', 'D', 'D', 'E', 'F', 'F', 'G', 'G', 'A', 'A', 'B'];
const SHARPS = [false, true, false, true, false, false, true, false, true, false, true, false];

export interface GuitarString {
  /** 弦号：6 是最粗的低音弦，1 是最细的高音弦。 */
  number: number;
  midi: number;
  label: string;
}

/** 标准调弦，按 6 弦到 1 弦排列。 */
export const STRINGS: readonly GuitarString[] = [
  { number: 6, midi: 40, label: 'E2' },
  { number: 5, midi: 45, label: 'A2' },
  { number: 4, midi: 50, label: 'D3' },
  { number: 3, midi: 55, label: 'G3' },
  { number: 2, midi: 59, label: 'B3' },
  { number: 1, midi: 64, label: 'E4' },
];

export interface NoteName {
  letter: string;
  sharp: boolean;
  octave: number;
}

export function midiToFrequency(midi: number, a4: number): number {
  return a4 * 2 ** ((midi - A4_MIDI) / 12);
}

/** frequency 相对 reference 的偏差，单位音分；正数偏高，负数偏低。 */
export function centsBetween(frequency: number, reference: number): number {
  return 1200 * Math.log2(frequency / reference);
}

export function nearestMidi(frequency: number, a4: number): number {
  return Math.round(A4_MIDI + 12 * Math.log2(frequency / a4));
}

export function noteName(midi: number): NoteName {
  const index = ((midi % 12) + 12) % 12;
  return { letter: LETTERS[index], sharp: SHARPS[index], octave: Math.floor(midi / 12) - 1 };
}

/** 音分距离最近的那根弦在 STRINGS 里的下标。 */
export function nearestStringIndex(frequency: number, a4: number): number {
  let best = 0;
  let bestDistance = Infinity;
  STRINGS.forEach((string, index) => {
    const distance = Math.abs(centsBetween(frequency, midiToFrequency(string.midi, a4)));
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  });
  return best;
}
