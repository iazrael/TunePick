/**
 * 读数稳定：把每一帧的原始频率变成稳定的调音读数。
 * 负责滤掉误检、平滑抖动、决定目标弦、判定是否调准。
 * 原理见 docs/架构算法/音高检测.md。
 */
import { A4_DEFAULT } from '../settings';
import { STRINGS, centsBetween, midiToFrequency, nearestMidi, nearestStringIndex } from './notes';

/** 'auto' 是自动识别；数字是手动选中的弦在 STRINGS 里的下标。 */
export type TargetMode = 'auto' | number;

export interface Reading {
  /** 当前频率（Hz），已平滑。 */
  frequency: number;
  /** 当前最接近的半音（MIDI 编号），用于显示音名。 */
  midi: number;
  /** 目标弦在 STRINGS 里的下标。 */
  stringIndex: number;
  /** 相对目标弦的偏差（音分），已平滑。负数偏低，正数偏高。 */
  cents: number;
  inTune: boolean;
  /** 信号已消失，这是保留的上一次读数。 */
  held: boolean;
}

export interface TrackerOptions {
  /** 信号消失后读数保留多久（毫秒）。 */
  holdMs?: number;
}

/** 取最近几帧的中位数，滤掉单帧误检。 */
const WINDOW_SIZE = 5;
/** 窗口里至少要有这么多帧和中位数一致，才算稳定。 */
const AGREE_COUNT = 3;
const AGREE_CENTS = 60;
/** 静音超过这个时长，下一次出声按重新拨弦处理。 */
const GAP_RESET_MS = 250;
/** 自动换弦：新弦要比当前目标弦近这么多音分，并且连续出现几帧。 */
const SWITCH_MARGIN_CENTS = 40;
const SWITCH_FRAMES = 2;
/** 偏差平滑的时间常数；变化超过 SNAP_CENTS 时直接跳过去，不拖尾。 */
const SMOOTH_MS = 90;
const SNAP_CENTS = 25;
/** 进入调准状态的门限，和退出的门限。退出放宽一点，避免在边界闪烁。 */
const IN_TUNE_ENTER_CENTS = 5;
const IN_TUNE_EXIT_CENTS = 6;
/** 显示的音名要偏离这么多音分才换，避免在半音边界来回跳。 */
const NOTE_SWITCH_CENTS = 60;

export class Tracker {
  private readonly holdMs: number;
  private a4 = A4_DEFAULT;
  private mode: TargetMode = 'auto';

  private recent: number[] = [];
  private target: number | null = null;
  /** 为 true 时，下一个稳定读数直接决定目标弦，不走换弦确认。 */
  private fresh = true;
  private pending: number | null = null;
  private pendingCount = 0;
  private smoothed: number | null = null;
  private inTune = false;
  private displayMidi: number | null = null;
  private last: Reading | null = null;
  private lastSignalMs = -Infinity;
  private lastReadingMs = -Infinity;

  constructor(options: TrackerOptions = {}) {
    this.holdMs = options.holdMs ?? 1200;
  }

  setA4(a4: number): void {
    this.a4 = a4;
    this.reset();
  }

  setMode(mode: TargetMode): void {
    this.mode = mode;
    this.fresh = true;
  }

  /** 清空全部状态，回到没有读数。 */
  reset(): void {
    this.recent = [];
    this.target = null;
    this.fresh = true;
    this.pending = null;
    this.pendingCount = 0;
    this.smoothed = null;
    this.inTune = false;
    this.displayMidi = null;
    this.last = null;
  }

  /**
   * 每分析一帧调用一次。
   * @param frequency 这一帧检测到的频率；没有可信的音高时传 null
   * @param timeMs 单调递增的时间戳（毫秒）
   */
  update(frequency: number | null, timeMs: number): Reading | null {
    const reading = frequency === null ? null : this.measure(frequency, timeMs);
    if (reading) {
      this.last = reading;
      this.lastReadingMs = timeMs;
      return reading;
    }
    if (!this.last) return null;
    if (timeMs - this.lastReadingMs > this.holdMs) {
      this.reset();
      return null;
    }
    return { ...this.last, held: true };
  }

  private measure(frequency: number, timeMs: number): Reading | null {
    const elapsedMs = timeMs - this.lastSignalMs;
    if (elapsedMs > GAP_RESET_MS) {
      this.recent = [];
      this.fresh = true;
    }
    this.lastSignalMs = timeMs;

    this.recent.push(frequency);
    if (this.recent.length > WINDOW_SIZE) this.recent.shift();
    const stable = this.stableFrequency();
    if (stable === null) return null;

    const candidate = this.mode === 'auto' ? nearestStringIndex(stable, this.a4) : this.mode;
    if (this.fresh || this.target === null) {
      this.setTarget(candidate);
      this.smoothed = null;
      this.fresh = false;
    } else if (candidate !== this.target) {
      const toTarget = Math.abs(centsBetween(stable, this.stringFrequency(this.target)));
      const toCandidate = Math.abs(centsBetween(stable, this.stringFrequency(candidate)));
      if (toTarget - toCandidate > SWITCH_MARGIN_CENTS) {
        this.pendingCount = candidate === this.pending ? this.pendingCount + 1 : 1;
        this.pending = candidate;
        // 还没确认换弦：维持上一次读数，不让指针朝旧目标弦甩出去
        if (this.pendingCount < SWITCH_FRAMES) return this.last;
        this.setTarget(candidate);
      }
    } else {
      this.pending = null;
      this.pendingCount = 0;
    }

    const target = this.target!;
    const targetFrequency = this.stringFrequency(target);
    const raw = centsBetween(stable, targetFrequency);
    if (this.smoothed === null || Math.abs(raw - this.smoothed) > SNAP_CENTS) {
      this.smoothed = raw;
    } else {
      this.smoothed += (1 - Math.exp(-elapsedMs / SMOOTH_MS)) * (raw - this.smoothed);
    }

    const limit = this.inTune ? IN_TUNE_EXIT_CENTS : IN_TUNE_ENTER_CENTS;
    this.inTune = Math.abs(this.smoothed) <= limit;

    if (
      this.displayMidi === null ||
      Math.abs(centsBetween(stable, midiToFrequency(this.displayMidi, this.a4))) > NOTE_SWITCH_CENTS
    ) {
      this.displayMidi = nearestMidi(stable, this.a4);
    }

    return {
      frequency: targetFrequency * 2 ** (this.smoothed / 1200),
      midi: this.displayMidi,
      stringIndex: target,
      cents: this.smoothed,
      inTune: this.inTune,
      held: false,
    };
  }

  /** 最近几帧的中位数；帧数不够或彼此不一致时返回 null。 */
  private stableFrequency(): number | null {
    if (this.recent.length < AGREE_COUNT) return null;
    const sorted = [...this.recent].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const agreeing = sorted.filter((f) => Math.abs(centsBetween(f, median)) <= AGREE_CENTS).length;
    return agreeing >= AGREE_COUNT ? median : null;
  }

  private setTarget(index: number): void {
    if (index !== this.target) {
      this.target = index;
      this.smoothed = null;
      this.inTune = false;
    }
    this.pending = null;
    this.pendingCount = 0;
  }

  private stringFrequency(index: number): number {
    return midiToFrequency(STRINGS[index].midi, this.a4);
  }
}
