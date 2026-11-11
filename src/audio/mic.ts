export type MicErrorKind = 'denied' | 'no-device' | 'busy' | 'insecure' | 'unsupported' | 'unknown';

export class MicError extends Error {
  readonly kind: MicErrorKind;

  constructor(kind: MicErrorKind, detail = '') {
    super(detail);
    this.name = 'MicError';
    this.kind = kind;
  }
}

export interface Mic {
  analyser: AnalyserNode;
  stop(): void;
}

const ERROR_KINDS: Record<string, MicErrorKind> = {
  NotAllowedError: 'denied',
  SecurityError: 'denied',
  NotFoundError: 'no-device',
  OverconstrainedError: 'no-device',
  NotReadableError: 'busy',
  AbortError: 'busy',
};

/**
 * 打开麦克风并接上分析节点。失败时抛出 MicError。
 * @param frameSize 分析节点每次提供的样本数
 * @param onEnded 麦克风中途断开（拔出、被系统收回）时调用
 */
export async function openMic(
  context: AudioContext,
  frameSize: number,
  onEnded: () => void,
): Promise<Mic> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new MicError(window.isSecureContext ? 'unsupported' : 'insecure');
  }

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        // 通话用的降噪、回声消除和自动增益会把持续的琴声当噪声削掉，全部关闭
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
  } catch (error) {
    const name = error instanceof DOMException ? error.name : '';
    const detail = error instanceof Error ? error.message : String(error);
    throw new MicError(ERROR_KINDS[name] ?? 'unknown', detail);
  }

  // 只留吉他基频和低次泛音所在的频段：滤掉低频轰鸣和高频嘶声
  const source = context.createMediaStreamSource(stream);
  const highpass = new BiquadFilterNode(context, { type: 'highpass', frequency: 50 });
  const lowpass = new BiquadFilterNode(context, { type: 'lowpass', frequency: 1500 });
  const analyser = new AnalyserNode(context, { fftSize: frameSize, smoothingTimeConstant: 0 });
  source.connect(highpass).connect(lowpass).connect(analyser);

  const [track] = stream.getAudioTracks();
  track.addEventListener('ended', onEnded);

  return {
    analyser,
    stop() {
      track.removeEventListener('ended', onEnded);
      stream.getTracks().forEach((t) => t.stop());
      source.disconnect();
    },
  };
}
