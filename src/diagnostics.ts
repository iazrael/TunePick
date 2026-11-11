/**
 * 诊断记录：在内存里留住最近一段检测过程，用户点「导出诊断文件」时才写成文件。
 * 记什么、怎么用见 docs/架构算法/音高检测.md。
 */
import type { FrameAnalysis } from './audio/analyze';
import { STRINGS } from './tuner/notes';
import type { Reading } from './tuner/tracker';

/** 每帧记录保留多少行；按分析间隔算大约一分钟。 */
export const FRAME_LOG_CAPACITY = 2000;
/** 波形快照保留多少帧。 */
export const SNAPSHOT_CAPACITY = 160;
/** 两帧波形快照的最小间隔（毫秒）。相邻的分析帧大部分重叠，没必要每帧都留。 */
export const SNAPSHOT_INTERVAL_MS = 150;
/** 拾音会话保留最近几次。 */
export const SESSION_CAPACITY = 5;

/**
 * 每帧记录的列：
 * t 时间戳（毫秒）、rms 音量、rawHz 和 clarity 是 MPM 的原始结果、hz 是过了门限的可信频率、
 * string 目标弦、cents 显示的偏差、held 这个读数是不是保留的旧读数（1 是，0 不是）。
 */
export const FRAME_COLUMNS = ['t', 'rms', 'rawHz', 'clarity', 'hz', 'string', 'cents', 'held'] as const;

export type FrameRow = [
  t: number,
  rms: number,
  rawHz: number | null,
  clarity: number | null,
  hz: number | null,
  string: string | null,
  cents: number | null,
  held: 0 | 1 | null,
];

export interface Snapshot {
  /** 时间戳（毫秒），和每帧记录的 t 对得上。 */
  t: number;
  /** 这一帧的峰值。还原：样本 = 16 位整数 ÷ 32767 × peak。 */
  peak: number;
  /** 一帧波形，按峰值归一化成 16 位小端整数，再转 base64。 */
  data: string;
}

export interface DiagnosticsReport {
  sessions: Record<string, unknown>[];
  frames: { columns: readonly string[]; rows: FrameRow[] };
  snapshots: { encoding: 's16le-base64'; items: Snapshot[] };
}

function round(value: number, digits: number): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function toBase64(pcm: Int16Array): string {
  const bytes = new Uint8Array(pcm.buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export class Diagnostics {
  private sessions: Record<string, unknown>[] = [];
  private rows: FrameRow[] = [];
  private snapshots: { t: number; peak: number; pcm: Int16Array }[] = [];
  private lastSnapshotMs = -Infinity;

  isEmpty(): boolean {
    return this.rows.length === 0;
  }

  /** 每次打开麦克风调用一次，记下这次拾音的采集参数。 */
  beginSession(timeMs: number, info: Record<string, unknown>): void {
    this.sessions.push({ t: Math.round(timeMs), ...info });
    if (this.sessions.length > SESSION_CAPACITY) this.sessions.shift();
  }

  /**
   * 每分析一帧调用一次。
   * @param frame 这一帧送去分析的波形；这里会复制，调用方可以继续复用缓冲区
   * @param reading 这一帧之后界面上显示的读数
   */
  record(timeMs: number, frame: Float32Array, analysis: FrameAnalysis, reading: Reading | null): void {
    const t = Math.round(timeMs);
    const { raw } = analysis;
    this.rows.push([
      t,
      round(analysis.rms, 5),
      raw && round(raw.frequency, 2),
      raw && round(raw.clarity, 3),
      analysis.frequency === null ? null : round(analysis.frequency, 2),
      reading && STRINGS[reading.stringIndex].label,
      reading && round(reading.cents, 1),
      reading && (reading.held ? 1 : 0),
    ]);
    if (this.rows.length > FRAME_LOG_CAPACITY) this.rows.shift();

    if (raw !== null && timeMs - this.lastSnapshotMs >= SNAPSHOT_INTERVAL_MS) {
      this.lastSnapshotMs = timeMs;
      let peak = 0;
      for (let i = 0; i < frame.length; i++) peak = Math.max(peak, Math.abs(frame[i]));
      // 按峰值归一化再量化：很轻的琴声也能用满 16 位，回放时频率不走样
      const pcm = Int16Array.from(frame, (sample) => Math.round((sample / peak) * 32767));
      this.snapshots.push({ t, peak, pcm });
      if (this.snapshots.length > SNAPSHOT_CAPACITY) this.snapshots.shift();
    }
  }

  report(): DiagnosticsReport {
    return {
      sessions: [...this.sessions],
      frames: { columns: FRAME_COLUMNS, rows: [...this.rows] },
      snapshots: {
        encoding: 's16le-base64',
        items: this.snapshots.map(({ t, peak, pcm }) => ({ t, peak, data: toBase64(pcm) })),
      },
    };
  }
}
