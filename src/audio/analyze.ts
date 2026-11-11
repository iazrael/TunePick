import { createPitchDetector, decimate, rms, type PitchResult } from './pitch';

/** 一帧至少这么长（秒），保证最低的 E2 在帧里有 6 个以上周期。 */
const MIN_FRAME_SECONDS = 0.08;
/** 降采样后的采样率不低于这个值；吉他基频远低于它，精度足够，计算量小得多。 */
const TARGET_SAMPLE_RATE = 20000;
/** 音量门限（均方根）。低于它视为没有琴声。 */
const RMS_GATE = 0.003;
/** 清晰度门限。低于它视为噪声或多个音混在一起。 */
const CLARITY_GATE = 0.9;

export interface FrameAnalysis {
  /** 这一帧的音量（均方根）。 */
  rms: number;
  /** MPM 的原始结果，没过清晰度门限的也在；音量不够或找不到周期时是 null。给诊断记录用。 */
  raw: PitchResult | null;
  /** 通过全部门限的可信基频（Hz）；没有可信音高时是 null。 */
  frequency: number | null;
}

export interface Analyzer {
  /** 每帧需要的样本数，是 2 的整数次幂，可直接用作 AnalyserNode.fftSize。 */
  frameSize: number;
  analyze(frame: Float32Array): FrameAnalysis;
}

export function createAnalyzer(sampleRate: number): Analyzer {
  const frameSize = 2 ** Math.ceil(Math.log2(sampleRate * MIN_FRAME_SECONDS));
  const factor = Math.max(1, Math.floor(sampleRate / TARGET_SAMPLE_RATE));
  const reduced = new Float32Array(Math.floor(frameSize / factor));
  const detector = createPitchDetector({ sampleRate: sampleRate / factor });

  return {
    frameSize,
    analyze(frame) {
      const level = rms(frame);
      if (level < RMS_GATE) return { rms: level, raw: null, frequency: null };
      const raw = detector.detect(decimate(frame, factor, reduced));
      const clear = raw !== null && raw.clarity >= CLARITY_GATE;
      return { rms: level, raw, frequency: clear ? raw.frequency : null };
    },
  };
}
