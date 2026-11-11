import { describe, expect, it } from 'vitest';
import { createPitchDetector, decimate, rms } from './pitch';

const STRING_FREQUENCIES = [82.41, 110.0, 146.83, 196.0, 246.94, 329.63];

/** 固定种子的伪随机数，保证噪声测试可重复。 */
function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

/** 合成带泛音的信号。harmonics[0] 是基频幅度。 */
function synth(
  frequency: number,
  sampleRate: number,
  length: number,
  harmonics: number[] = [1],
  noise = 0,
  seed = 1,
): Float32Array {
  const random = seededRandom(seed);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    let value = 0;
    harmonics.forEach((amplitude, h) => {
      value += amplitude * Math.sin((2 * Math.PI * frequency * (h + 1) * i) / sampleRate + h);
    });
    out[i] = value * 0.2 + (random() * 2 - 1) * noise;
  }
  return out;
}

function cents(a: number, b: number): number {
  return 1200 * Math.log2(a / b);
}

describe('createPitchDetector', () => {
  for (const sampleRate of [22050, 24000, 44100, 48000]) {
    const length = sampleRate > 30000 ? 4096 : 2048;

    it(`${sampleRate} Hz 采样率下识别六根弦的纯音，误差小于 1 音分`, () => {
      const detector = createPitchDetector({ sampleRate });
      for (const frequency of STRING_FREQUENCIES) {
        const result = detector.detect(synth(frequency, sampleRate, length));
        expect(result).not.toBeNull();
        expect(Math.abs(cents(result!.frequency, frequency))).toBeLessThan(1);
        expect(result!.clarity).toBeGreaterThan(0.95);
      }
    });
  }

  it('泛音丰富时仍然给出基频，不跳到高八度', () => {
    const detector = createPitchDetector({ sampleRate: 24000 });
    const guitarLike = [1, 0.8, 0.6, 0.4, 0.3, 0.2];
    for (const frequency of STRING_FREQUENCIES) {
      const result = detector.detect(synth(frequency, 24000, 2048, guitarLike));
      expect(result).not.toBeNull();
      expect(Math.abs(cents(result!.frequency, frequency))).toBeLessThan(2);
    }
  });

  it('基频很弱（手机麦克风低频衰减）时仍然给出基频', () => {
    const detector = createPitchDetector({ sampleRate: 24000 });
    const weakFundamental = [0.15, 1, 0.7, 0.5, 0.3];
    for (const frequency of [82.41, 110.0, 146.83]) {
      const result = detector.detect(synth(frequency, 24000, 2048, weakFundamental));
      expect(result).not.toBeNull();
      expect(Math.abs(cents(result!.frequency, frequency))).toBeLessThan(2);
    }
  });

  it('能分辨几个音分的偏差', () => {
    const detector = createPitchDetector({ sampleRate: 24000 });
    for (const offset of [-30, -5, 5, 30]) {
      const frequency = 110 * 2 ** (offset / 1200);
      const result = detector.detect(synth(frequency, 24000, 2048, [1, 0.5, 0.3]));
      expect(cents(result!.frequency, 110)).toBeCloseTo(offset, 0);
    }
  });

  it('带环境噪声时仍然准确', () => {
    const detector = createPitchDetector({ sampleRate: 24000 });
    for (const frequency of STRING_FREQUENCIES) {
      const result = detector.detect(synth(frequency, 24000, 2048, [1, 0.5, 0.3], 0.03, 7));
      expect(result).not.toBeNull();
      expect(Math.abs(cents(result!.frequency, frequency))).toBeLessThan(3);
      expect(result!.clarity).toBeGreaterThan(0.9);
    }
  });

  it('纯噪声的清晰度低，会被门限挡掉', () => {
    const detector = createPitchDetector({ sampleRate: 24000 });
    for (const seed of [1, 2, 3, 4, 5]) {
      const result = detector.detect(synth(100, 24000, 2048, [0], 0.3, seed));
      expect(result === null || result.clarity < 0.8).toBe(true);
    }
  });

  it('静音返回 null', () => {
    const detector = createPitchDetector({ sampleRate: 24000 });
    expect(detector.detect(new Float32Array(2048))).toBeNull();
  });

  it('超出检测范围的频率返回 null', () => {
    const detector = createPitchDetector({ sampleRate: 24000, minFrequency: 60, maxFrequency: 1000 });
    expect(detector.detect(synth(30, 24000, 2048))).toBeNull();
    expect(detector.detect(synth(2500, 24000, 2048))).toBeNull();
  });
});

describe('decimate', () => {
  it('按倍数降采样，取相邻样本的平均值', () => {
    const out = decimate(new Float32Array([1, 3, 5, 7, 9, 11]), 2, new Float32Array(3));
    expect(Array.from(out)).toEqual([2, 6, 10]);
  });

  it('倍数为 1 时原样复制', () => {
    const out = decimate(new Float32Array([1, 2, 3]), 1, new Float32Array(3));
    expect(Array.from(out)).toEqual([1, 2, 3]);
  });

  it('降采样后音高检测结果不变', () => {
    const input = synth(82.41, 48000, 4096, [1, 0.6, 0.4]);
    const output = decimate(input, 2, new Float32Array(2048));
    const result = createPitchDetector({ sampleRate: 24000 }).detect(output);
    expect(Math.abs(cents(result!.frequency, 82.41))).toBeLessThan(1);
  });
});

describe('rms', () => {
  it('计算均方根', () => {
    expect(rms(new Float32Array([0.5, -0.5, 0.5, -0.5]))).toBeCloseTo(0.5, 6);
    expect(rms(new Float32Array(8))).toBe(0);
  });
});
