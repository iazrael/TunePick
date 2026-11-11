/**
 * 基频检测：McLeod Pitch Method（MPM）。
 * 原理见 docs/架构算法/音高检测.md。
 */

export interface PitchResult {
  /** 基频（Hz）。 */
  frequency: number;
  /** 清晰度，0 到 1。越接近 1 说明信号越像一个稳定的单音。 */
  clarity: number;
}

export interface PitchDetectorOptions {
  sampleRate: number;
  minFrequency?: number;
  maxFrequency?: number;
}

export interface PitchDetector {
  /** 样本长度至少要覆盖最低频率的两个周期。检测不到返回 null。 */
  detect(samples: Float32Array): PitchResult | null;
}

/** 候选峰达到最高峰的这个比例就采用。取最靠前的一个，避免把两倍周期当成基频。 */
const PEAK_RATIO = 0.9;

export function createPitchDetector(options: PitchDetectorOptions): PitchDetector {
  const { sampleRate, minFrequency = 60, maxFrequency = 1000 } = options;
  const minLag = sampleRate / maxFrequency;
  let nsdf = new Float32Array(0);

  function detect(samples: Float32Array): PitchResult | null {
    const size = samples.length;
    const maxLag = Math.min(Math.floor(sampleRate / minFrequency), Math.floor(size / 2));
    if (nsdf.length !== maxLag + 1) nsdf = new Float32Array(maxLag + 1);

    // 归一化平方差函数 nsdf(lag) = 2·r(lag) / m(lag)
    // r 是自相关，m 是两段信号的能量和；m 可以逐步递推，不用每次重算。
    let energy = 0;
    for (let i = 0; i < size; i++) energy += samples[i] * samples[i];
    if (energy === 0) return null;

    let m = 2 * energy;
    for (let lag = 0; lag <= maxLag; lag++) {
      let r = 0;
      for (let i = 0, end = size - lag; i < end; i++) r += samples[i] * samples[i + lag];
      nsdf[lag] = m > 0 ? (2 * r) / m : 0;
      const head = samples[lag];
      const tail = samples[size - 1 - lag];
      m -= head * head + tail * tail;
    }

    // 跳过 lag = 0 附近的第一个正区间，然后在后面每个正区间里各取一个最高点。
    let lag = 0;
    while (lag <= maxLag && nsdf[lag] > 0) lag++;

    let highest = 0;
    const peaks: number[] = [];
    while (lag < maxLag) {
      while (lag < maxLag && nsdf[lag] <= 0) lag++;
      let peak = -1;
      while (lag < maxLag && nsdf[lag] > 0) {
        const isLocalMax = nsdf[lag] > nsdf[lag - 1] && nsdf[lag] >= nsdf[lag + 1];
        if (isLocalMax && (peak < 0 || nsdf[lag] > nsdf[peak])) peak = lag;
        lag++;
      }
      if (peak > 0) {
        peaks.push(peak);
        if (nsdf[peak] > highest) highest = nsdf[peak];
      }
    }
    if (peaks.length === 0) return null;

    const threshold = highest * PEAK_RATIO;
    const chosen = peaks.find((peak) => nsdf[peak] >= threshold)!;

    // 用抛物线插值把峰的位置细化到小数采样点。
    const before = nsdf[chosen - 1];
    const at = nsdf[chosen];
    const after = nsdf[chosen + 1];
    const curve = before - 2 * at + after;
    const shift = curve === 0 ? 0 : (0.5 * (before - after)) / curve;
    const period = chosen + shift;
    if (period < minLag) return null;

    return {
      frequency: sampleRate / period,
      clarity: Math.min(1, at - 0.25 * (before - after) * shift),
    };
  }

  return { detect };
}

/** 降采样：每 factor 个样本取平均，写入 out。out 的长度决定输出多少个样本。 */
export function decimate(input: Float32Array, factor: number, out: Float32Array): Float32Array {
  for (let i = 0; i < out.length; i++) {
    let sum = 0;
    for (let j = 0; j < factor; j++) sum += input[i * factor + j];
    out[i] = sum / factor;
  }
  return out;
}

/** 均方根，用来判断音量。 */
export function rms(samples: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return samples.length === 0 ? 0 : Math.sqrt(sum / samples.length);
}
