import { describe, expect, it } from 'vitest';
import { midiToFrequency } from './notes';
import { Tracker, type Reading } from './tracker';

const FRAME_MS = 33;
const E2 = midiToFrequency(40, 440);
const A2 = midiToFrequency(45, 440);

function detune(frequency: number, cents: number): number {
  return frequency * 2 ** (cents / 1200);
}

/** 按固定帧间隔喂一串频率，返回每一帧的输出。 */
function feed(
  tracker: Tracker,
  frequencies: (number | null)[],
  startMs = 0,
): (Reading | null)[] {
  return frequencies.map((frequency, i) => tracker.update(frequency, startMs + i * FRAME_MS));
}

function repeat<T>(value: T, count: number): T[] {
  return Array.from({ length: count }, () => value);
}

describe('Tracker', () => {
  it('连续 3 帧一致才出读数', () => {
    const tracker = new Tracker();
    const out = feed(tracker, repeat(E2, 3));
    expect(out[0]).toBeNull();
    expect(out[1]).toBeNull();
    expect(out[2]).toMatchObject({ stringIndex: 0, midi: 40, held: false, inTune: true });
    expect(out[2]!.frequency).toBeCloseTo(E2, 3);
    expect(out[2]!.cents).toBeCloseTo(0, 3);
  });

  it('零星的噪声误检不出读数', () => {
    const tracker = new Tracker();
    const out = feed(tracker, [97, null, 412, 151, null, 660, 233, 75]);
    expect(out.every((reading) => reading === null)).toBe(true);
  });

  it('单帧倍频误检不影响读数', () => {
    const tracker = new Tracker();
    const out = feed(tracker, [...repeat(E2, 5), E2 * 2, ...repeat(E2, 4)]);
    for (const reading of out.slice(2)) {
      expect(reading!.stringIndex).toBe(0);
      expect(reading!.frequency).toBeCloseTo(E2, 3);
      expect(Math.abs(reading!.cents)).toBeLessThan(1);
    }
  });

  it('自动模式下换弦会跟上，中途指针不乱甩', () => {
    const tracker = new Tracker();
    const out = feed(tracker, [...repeat(E2, 8), ...repeat(A2, 12)]);
    expect(out[7]!.stringIndex).toBe(0);
    expect(out.at(-1)!.stringIndex).toBe(1);
    expect(out.at(-1)!.midi).toBe(45);
    // 两根弦都是准的，任何一帧都不该出现大偏差
    for (const reading of out.slice(2)) {
      expect(Math.abs(reading!.cents)).toBeLessThan(5);
    }
    // 换弦在 250 ms 内完成
    const switchedAt = out.findIndex((reading) => reading?.stringIndex === 1);
    expect((switchedAt - 8) * FRAME_MS).toBeLessThanOrEqual(250);
  });

  it('停顿后重新拨另一根弦，3 帧内切换', () => {
    const tracker = new Tracker();
    feed(tracker, repeat(E2, 6));
    const gapStart = 6 * FRAME_MS;
    feed(tracker, repeat(null, 12), gapStart);
    const out = feed(tracker, repeat(A2, 3), gapStart + 12 * FRAME_MS);
    expect(out[2]).toMatchObject({ stringIndex: 1, held: false });
  });

  it('频率在两根弦正中间抖动时不来回跳弦', () => {
    const tracker = new Tracker();
    // E2 和 A2 相距 500 音分，正中间是 E2 + 250
    const jitter = [245, 256, 247, 258, 244, 255, 249, 253, 246, 257, 248, 254];
    const out = feed(tracker, jitter.map((cents) => detune(E2, cents)));
    const strings = new Set(out.filter((r) => r !== null).map((r) => r!.stringIndex));
    expect(strings.size).toBe(1);
  });

  it('平滑掉几个音分的抖动', () => {
    const tracker = new Tracker();
    const jitter = [3, -3, 2, -2, 3, -3, 1, -2, 3, -3, 2, -1, 3, -3, 2, -2];
    const out = feed(tracker, jitter.map((j) => detune(E2, 10 + j)));
    const settled = out.slice(6).map((reading) => reading!.cents);
    expect(Math.max(...settled) - Math.min(...settled)).toBeLessThan(2.5);
    for (const cents of settled) {
      expect(cents).toBeGreaterThan(8);
      expect(cents).toBeLessThan(12);
    }
  });

  it('大幅变化时快速跟上，不拖尾', () => {
    const tracker = new Tracker();
    const out = feed(tracker, [...repeat(detune(E2, -40), 6), ...repeat(E2, 6)]);
    expect(out[5]!.cents).toBeCloseTo(-40, 0);
    expect(Math.abs(out.at(-1)!.cents)).toBeLessThan(2);
  });

  it('信号消失后先保持读数，超时后清空', () => {
    const tracker = new Tracker({ holdMs: 1000 });
    feed(tracker, repeat(detune(E2, 12), 4));
    const lastSignalMs = 3 * FRAME_MS;
    const held = tracker.update(null, lastSignalMs + 500);
    expect(held).toMatchObject({ stringIndex: 0, held: true });
    expect(held!.cents).toBeCloseTo(12, 0);
    expect(tracker.update(null, lastSignalMs + 1001)).toBeNull();
    // 清空后重新开始
    expect(tracker.update(E2, lastSignalMs + 1100)).toBeNull();
  });

  it('±5 音分内判定调准，超过 6 音分才退出', () => {
    const tracker = new Tracker();
    const at = (cents: number, startMs: number): Reading =>
      feed(tracker, repeat(detune(E2, cents), 10), startMs).at(-1)!;

    expect(at(8, 0).inTune).toBe(false);
    expect(at(4.5, 1000).inTune).toBe(true);
    expect(at(5.8, 2000).inTune).toBe(true);
    expect(at(6.5, 3000).inTune).toBe(false);
    expect(at(5.5, 4000).inTune).toBe(false);
    expect(at(-4.5, 5000).inTune).toBe(true);
  });

  it('手动选弦后目标固定，偏差按选中的弦计算', () => {
    const tracker = new Tracker();
    tracker.setMode(0);
    const out = feed(tracker, repeat(A2, 5));
    expect(out.at(-1)).toMatchObject({ stringIndex: 0, midi: 45, inTune: false });
    expect(out.at(-1)!.cents).toBeCloseTo(500, 0);
  });

  it('切回自动后重新按最近的弦判断', () => {
    const tracker = new Tracker();
    tracker.setMode(0);
    feed(tracker, repeat(A2, 5));
    tracker.setMode('auto');
    const out = feed(tracker, repeat(A2, 5), 1000);
    expect(out.at(-1)).toMatchObject({ stringIndex: 1, inTune: true });
  });

  it('基准频率变化后偏差随之变化', () => {
    const tracker = new Tracker();
    tracker.setA4(432);
    const out = feed(tracker, repeat(E2, 5));
    // 432 基准下 E2 更低，440 的 E2 偏高约 31.8 音分
    expect(out.at(-1)!.cents).toBeCloseTo(1200 * Math.log2(440 / 432), 1);
    expect(out.at(-1)!.inTune).toBe(false);
  });

  it('显示的音名在半音边界附近不来回跳', () => {
    const tracker = new Tracker();
    tracker.setMode(0);
    // 在 E2 和 F2 的分界（+50 音分）两侧抖动
    const jitter = [44, 53, 47, 54, 46, 55, 48, 52, 45, 56];
    const out = feed(tracker, jitter.map((cents) => detune(E2, cents)));
    const names = new Set(out.filter((r) => r !== null).map((r) => r!.midi));
    expect(names.size).toBe(1);
  });
});
