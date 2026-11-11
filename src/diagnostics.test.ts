import { describe, expect, it } from 'vitest';
import { createAnalyzer, type FrameAnalysis } from './audio/analyze';
import {
  Diagnostics,
  FRAME_COLUMNS,
  FRAME_LOG_CAPACITY,
  SESSION_CAPACITY,
  SNAPSHOT_CAPACITY,
  SNAPSHOT_INTERVAL_MS,
  type Snapshot,
} from './diagnostics';
import type { Reading } from './tuner/tracker';

const SAMPLE_RATE = 48000;

function sine(frequency: number, length: number, amplitude: number): Float32Array {
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    out[i] = amplitude * Math.sin((2 * Math.PI * frequency * i) / SAMPLE_RATE);
  }
  return out;
}

/** 按导出文件里写明的编码还原一帧波形。 */
function decode(snapshot: Snapshot): Float32Array {
  const bytes = Uint8Array.from(atob(snapshot.data), (char) => char.charCodeAt(0));
  return Float32Array.from(new Int16Array(bytes.buffer), (value) => (value / 32767) * snapshot.peak);
}

const SOUND: FrameAnalysis = { rms: 0.0412345, raw: { frequency: 82.4149, clarity: 0.98765 }, frequency: 82.4149 };
const UNCLEAR: FrameAnalysis = { rms: 0.02, raw: { frequency: 431.239, clarity: 0.5 }, frequency: null };
const SILENCE: FrameAnalysis = { rms: 0.0001234, raw: null, frequency: null };
const READING: Reading = { frequency: 82.2, midi: 40, stringIndex: 0, cents: -4.26, inTune: true, held: false };
const FRAME = sine(82.41, 4096, 0.05);

describe('Diagnostics', () => {
  it('一开始是空的，记过一帧就不空', () => {
    const diagnostics = new Diagnostics();
    expect(diagnostics.isEmpty()).toBe(true);
    diagnostics.record(0, FRAME, SILENCE, null);
    expect(diagnostics.isEmpty()).toBe(false);
  });

  it('每帧记一行，各列和 columns 对应，数值按固定精度取整', () => {
    const diagnostics = new Diagnostics();
    diagnostics.record(1234.56, FRAME, SOUND, READING);
    const { frames } = diagnostics.report();
    expect(frames.columns).toEqual(FRAME_COLUMNS);
    expect(frames.columns).toEqual(['t', 'rms', 'rawHz', 'clarity', 'hz', 'string', 'cents', 'held']);
    expect(frames.rows).toEqual([[1235, 0.04123, 82.41, 0.988, 82.41, 'E2', -4.3, 0]]);
  });

  it('没过清晰度门限的帧保留原始频率，可信频率是 null', () => {
    const diagnostics = new Diagnostics();
    diagnostics.record(10, FRAME, UNCLEAR, null);
    expect(diagnostics.report().frames.rows).toEqual([[10, 0.02, 431.24, 0.5, null, null, null, null]]);
  });

  it('没有琴声时沿用的读数标记为保留', () => {
    const diagnostics = new Diagnostics();
    diagnostics.record(10, FRAME, SILENCE, { ...READING, held: true });
    expect(diagnostics.report().frames.rows).toEqual([[10, 0.00012, null, null, null, 'E2', -4.3, 1]]);
  });

  it('每帧记录超过容量时丢掉最早的', () => {
    const diagnostics = new Diagnostics();
    for (let i = 0; i < FRAME_LOG_CAPACITY + 3; i++) diagnostics.record(i, FRAME, SILENCE, null);
    const { rows } = diagnostics.report().frames;
    expect(rows).toHaveLength(FRAME_LOG_CAPACITY);
    expect(rows[0][0]).toBe(3);
    expect(rows.at(-1)![0]).toBe(FRAME_LOG_CAPACITY + 2);
  });

  it('MPM 算出周期的帧才留波形快照，两帧快照至少间隔 SNAPSHOT_INTERVAL_MS', () => {
    const diagnostics = new Diagnostics();
    diagnostics.record(0, FRAME, SILENCE, null);
    diagnostics.record(30, FRAME, SOUND, READING);
    diagnostics.record(60, FRAME, SOUND, READING);
    diagnostics.record(30 + SNAPSHOT_INTERVAL_MS - 1, FRAME, UNCLEAR, null);
    diagnostics.record(30 + SNAPSHOT_INTERVAL_MS, FRAME, UNCLEAR, null);
    const { snapshots } = diagnostics.report();
    expect(snapshots.encoding).toBe('s16le-base64');
    expect(snapshots.items.map((item) => item.t)).toEqual([30, 30 + SNAPSHOT_INTERVAL_MS]);
  });

  it('波形快照超过容量时丢掉最早的', () => {
    const diagnostics = new Diagnostics();
    for (let i = 0; i < SNAPSHOT_CAPACITY + 2; i++) {
      diagnostics.record(i * SNAPSHOT_INTERVAL_MS, FRAME, SOUND, READING);
    }
    const { items } = diagnostics.report().snapshots;
    expect(items).toHaveLength(SNAPSHOT_CAPACITY);
    expect(items[0].t).toBe(2 * SNAPSHOT_INTERVAL_MS);
  });

  it('快照按峰值归一化，很轻的琴声解码后重新分析也得到同样的频率', () => {
    const analyzer = createAnalyzer(SAMPLE_RATE);
    const diagnostics = new Diagnostics();
    for (const [index, frequency] of [82.41, 196.0, 329.63].entries()) {
      // 刚过音量门限的幅度：直接量化成 16 位会丢精度，归一化后不会
      const frame = sine(frequency, analyzer.frameSize, 0.006);
      const analysis = analyzer.analyze(frame);
      diagnostics.record(index * SNAPSHOT_INTERVAL_MS, frame, analysis, null);

      const snapshot = diagnostics.report().snapshots.items[index];
      expect(snapshot.peak).toBeCloseTo(0.006, 4);
      const replayed = analyzer.analyze(decode(snapshot));
      expect(Math.abs(1200 * Math.log2(replayed.frequency! / analysis.frequency!))).toBeLessThan(0.01);
    }
  });

  it('记录时复制波形，之后缓冲区被改写不影响快照', () => {
    const diagnostics = new Diagnostics();
    const frame = sine(110, 4096, 0.05);
    diagnostics.record(0, frame, SOUND, READING);
    const before = diagnostics.report().snapshots.items[0].data;
    frame.fill(0);
    expect(diagnostics.report().snapshots.items[0].data).toBe(before);
  });

  it('拾音会话带开始时间，只保留最近几次', () => {
    const diagnostics = new Diagnostics();
    for (let i = 0; i < SESSION_CAPACITY + 1; i++) {
      diagnostics.beginSession(i * 1000.4, { sampleRate: SAMPLE_RATE, index: i });
    }
    const { sessions } = diagnostics.report();
    expect(sessions).toHaveLength(SESSION_CAPACITY);
    expect(sessions[0]).toEqual({ t: 1000, sampleRate: SAMPLE_RATE, index: 1 });
  });
});
