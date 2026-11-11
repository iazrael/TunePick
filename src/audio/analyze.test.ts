import { describe, expect, it } from 'vitest';
import { createAnalyzer } from './analyze';

function sine(frequency: number, sampleRate: number, length: number, amplitude: number): Float32Array {
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    out[i] = amplitude * Math.sin((2 * Math.PI * frequency * i) / sampleRate);
  }
  return out;
}

function noise(length: number, amplitude: number): Float32Array {
  let state = 42;
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    state = (state * 1664525 + 1013904223) >>> 0;
    out[i] = (state / 0x80000000 - 1) * amplitude;
  }
  return out;
}

describe('createAnalyzer', () => {
  it('按采样率选择帧长，时长在 80 到 190 毫秒之间', () => {
    for (const sampleRate of [16000, 22050, 44100, 48000, 96000]) {
      const { frameSize } = createAnalyzer(sampleRate);
      expect(Number.isInteger(Math.log2(frameSize))).toBe(true);
      const durationMs = (frameSize / sampleRate) * 1000;
      expect(durationMs).toBeGreaterThanOrEqual(80);
      expect(durationMs).toBeLessThan(190);
    }
  });

  for (const sampleRate of [16000, 44100, 48000, 96000]) {
    it(`${sampleRate} Hz 采样率下识别 E2 和 E4`, () => {
      const analyzer = createAnalyzer(sampleRate);
      for (const frequency of [82.41, 329.63]) {
        const result = analyzer.analyze(sine(frequency, sampleRate, analyzer.frameSize, 0.1));
        expect(result.frequency).not.toBeNull();
        expect(Math.abs(1200 * Math.log2(result.frequency! / frequency))).toBeLessThan(1);
        expect(result.raw!.frequency).toBe(result.frequency);
        expect(result.rms).toBeCloseTo(0.1 / Math.SQRT2, 3);
      }
    });
  }

  it('音量低于门限时没有频率，也不做基频检测，但仍然给出音量', () => {
    const analyzer = createAnalyzer(48000);
    const result = analyzer.analyze(sine(110, 48000, analyzer.frameSize, 0.001));
    expect(result.frequency).toBeNull();
    expect(result.raw).toBeNull();
    expect(result.rms).toBeCloseTo(0.001 / Math.SQRT2, 5);
  });

  it('噪声没有可信频率，但保留没过清晰度门限的原始结果', () => {
    const analyzer = createAnalyzer(48000);
    const result = analyzer.analyze(noise(analyzer.frameSize, 0.3));
    expect(result.frequency).toBeNull();
    expect(result.raw).not.toBeNull();
    expect(result.raw!.clarity).toBeLessThan(0.9);
  });
});
