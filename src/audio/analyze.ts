import { createPitchDetector, decimate, rms } from './pitch';

/** 一帧至少这么长（秒），保证最低的 E2 在帧里有 6 个以上周期。 */
const MIN_FRAME_SECONDS = 0.08;
/** 降采样后的采样率不低于这个值；吉他基频远低于它，精度足够，计算量小得多。 */
const TARGET_SAMPLE_RATE = 20000;
/** 音量门限（均方根）。低于它视为没有琴声。 */
const RMS_GATE = 0.003;
/** 清晰度门限。低于它视为噪声或多个音混在一起。 */
const CLARITY_GATE = 0.9;

export interface Analyzer {
  /** 每帧需要的样本数，是 2 的整数次幂，可直接用作 AnalyserNode.fftSize。 */
  frameSize: number;
  /** 分析一帧，返回可信的基频（Hz）；没有可信音高时返回 null。 */
  analyze(frame: Float32Array): number | null;
}

export function createAnalyzer(sampleRate: number): Analyzer {
  const frameSize = 2 ** Math.ceil(Math.log2(sampleRate * MIN_FRAME_SECONDS));
  const factor = Math.max(1, Math.floor(sampleRate / TARGET_SAMPLE_RATE));
  const reduced = new Float32Array(Math.floor(frameSize / factor));
  const detector = createPitchDetector({ sampleRate: sampleRate / factor });

  return {
    frameSize,
    analyze(frame) {
      if (rms(frame) < RMS_GATE) return null;
      const result = detector.detect(decimate(frame, factor, reduced));
      return result !== null && result.clarity >= CLARITY_GATE ? result.frequency : null;
    },
  };
}
