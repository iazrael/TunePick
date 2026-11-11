import { describe, expect, it } from 'vitest';
import {
  STRINGS,
  centsBetween,
  midiToFrequency,
  nearestMidi,
  nearestStringIndex,
  noteName,
} from './notes';

describe('midiToFrequency', () => {
  it('A4 等于基准频率', () => {
    expect(midiToFrequency(69, 440)).toBe(440);
    expect(midiToFrequency(69, 432)).toBe(432);
  });

  it('六根弦的标准频率正确（A4 = 440）', () => {
    const expected = [82.41, 110.0, 146.83, 196.0, 246.94, 329.63];
    STRINGS.forEach((string, i) => {
      expect(midiToFrequency(string.midi, 440)).toBeCloseTo(expected[i], 2);
    });
  });
});

describe('centsBetween', () => {
  it('相同频率为 0', () => {
    expect(centsBetween(110, 110)).toBe(0);
  });

  it('高八度为 +1200，低半音为 -100', () => {
    expect(centsBetween(220, 110)).toBeCloseTo(1200, 6);
    expect(centsBetween(midiToFrequency(39, 440), midiToFrequency(40, 440))).toBeCloseTo(-100, 6);
  });
});

describe('nearestMidi', () => {
  it('找到最近的半音', () => {
    expect(nearestMidi(82.41, 440)).toBe(40);
    expect(nearestMidi(440, 440)).toBe(69);
    // 偏高 40 音分仍归 E2，偏高 60 音分归 F2
    expect(nearestMidi(82.41 * 2 ** (40 / 1200), 440)).toBe(40);
    expect(nearestMidi(82.41 * 2 ** (60 / 1200), 440)).toBe(41);
  });

  it('随基准频率变化', () => {
    expect(nearestMidi(432, 432)).toBe(69);
  });
});

describe('noteName', () => {
  it('拆出音名、升号和八度', () => {
    expect(noteName(40)).toEqual({ letter: 'E', sharp: false, octave: 2 });
    expect(noteName(69)).toEqual({ letter: 'A', sharp: false, octave: 4 });
    expect(noteName(60)).toEqual({ letter: 'C', sharp: false, octave: 4 });
    expect(noteName(42)).toEqual({ letter: 'F', sharp: true, octave: 2 });
    expect(noteName(59)).toEqual({ letter: 'B', sharp: false, octave: 3 });
  });
});

describe('STRINGS', () => {
  it('按 6 弦到 1 弦排列：E2 A2 D3 G3 B3 E4', () => {
    expect(STRINGS.map((s) => s.number)).toEqual([6, 5, 4, 3, 2, 1]);
    expect(STRINGS.map((s) => s.label)).toEqual(['E2', 'A2', 'D3', 'G3', 'B3', 'E4']);
  });
});

describe('nearestStringIndex', () => {
  it('标准频率对应各自的弦', () => {
    STRINGS.forEach((string, i) => {
      expect(nearestStringIndex(midiToFrequency(string.midi, 440), 440)).toBe(i);
    });
  });

  it('跑调的弦归到音分距离最近的弦', () => {
    // D2 比 E2 低两个半音，仍归 6 弦
    expect(nearestStringIndex(73.42, 440)).toBe(0);
    // G2（98 Hz）离 A2 两个半音、离 E2 三个半音，归 5 弦
    expect(nearestStringIndex(98, 440)).toBe(1);
    // 高于 E4 很多仍归 1 弦
    expect(nearestStringIndex(500, 440)).toBe(5);
  });
});
