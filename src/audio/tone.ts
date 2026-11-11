/** 参考音时长（秒）。 */
export const TONE_SECONDS = 2;

/** 各次泛音的幅度。加泛音是因为手机扬声器放不出 E2 这么低的基频，靠泛音才听得出音高。 */
const HARMONICS = [0, 1, 0.55, 0.38, 0.22, 0.14, 0.08];

let playing: { oscillator: OscillatorNode; gain: GainNode } | null = null;

/** 播放一个像拨弦一样渐弱的参考音；正在播放的参考音会被打断。 */
export function playTone(context: AudioContext, frequency: number): void {
  const now = context.currentTime;
  if (playing) {
    playing.gain.gain.cancelScheduledValues(now);
    playing.gain.gain.setTargetAtTime(0, now, 0.01);
    playing.oscillator.stop(now + 0.05);
  }

  const wave = context.createPeriodicWave(new Float32Array(HARMONICS.length), new Float32Array(HARMONICS));
  const oscillator = new OscillatorNode(context, { frequency, periodicWave: wave, type: 'custom' });
  const gain = new GainNode(context, { gain: 0.0001 });
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.5, now + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.001, now + TONE_SECONDS);

  oscillator.connect(gain).connect(context.destination);
  oscillator.start(now);
  oscillator.stop(now + TONE_SECONDS + 0.05);

  const current = { oscillator, gain };
  playing = current;
  oscillator.addEventListener('ended', () => {
    gain.disconnect();
    if (playing === current) playing = null;
  });
}
