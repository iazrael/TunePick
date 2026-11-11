import '@fontsource/barlow-condensed/latin-500.css';
import '@fontsource/barlow-condensed/latin-600.css';
import './style.css';

import { createAnalyzer, type Analyzer } from './audio/analyze';
import { MicError, openMic, type Mic, type MicErrorKind } from './audio/mic';
import { APP_BUILD, APP_VERSION } from './build-info';
import { pwa } from './pwa';
import { TONE_SECONDS, playTone } from './audio/tone';
import { A4_DEFAULT, A4_MAX, A4_MIN, clampA4, loadSettings, saveSettings } from './settings';
import { STRINGS, midiToFrequency, noteName } from './tuner/notes';
import { Tracker, type Reading, type TargetMode } from './tuner/tracker';
import { GAUGE_MAX_CENTS, buildGauge } from './ui/gauge';
import { setupUpdateUi } from './ui/update';

type Phase = 'idle' | 'starting' | 'listening';

/** 两次音高分析的最小间隔（毫秒）。 */
const ANALYSIS_INTERVAL_MS = 30;
/** 指针追上读数的时间常数（毫秒）。 */
const NEEDLE_EASE_MS = 70;
/** 没有读数时指针停靠的位置（音分）：最左端，和老式指针表一样。 */
const NEEDLE_REST_CENTS = -GAUGE_MAX_CENTS;
/** 参考音结束后再等这么久才恢复拾音，避开余音。 */
const TONE_TAIL_MS = 250;

const MIC_ERROR_TEXT: Record<MicErrorKind, string> = {
  denied: '麦克风权限被拒绝，听不到琴声。请在浏览器的网站设置里允许使用麦克风，再点「开始调音」。',
  'no-device': '没有找到麦克风。接好麦克风后再点「开始调音」。',
  busy: '麦克风打不开，可能正被其他应用占用。关掉占用它的应用后再点「开始调音」。',
  insecure: '当前地址不是 HTTPS，浏览器不允许使用麦克风。请改用 https 地址打开。',
  unsupported: '这个浏览器不支持麦克风采集。请换用新版的 Chrome、Safari、Edge 或 Firefox。',
  unknown: '麦克风打开失败。',
};

function byId<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

const app = byId('app');
const noteLetter = byId('note-letter');
const noteSharp = byId('note-sharp');
const noteOctave = byId('note-octave');
const frequencyText = byId('frequency');
const centsText = byId('cents');
const statusText = byId('status');
const stringsHint = byId('strings-hint');
const notice = byId('notice');
const toggleButton = byId<HTMLButtonElement>('toggle');
const autoButton = byId<HTMLButtonElement>('auto');
const fretboard = byId('fretboard');
const a4Label = byId('a4-label');
const a4Value = byId('a4-value');
const a4Down = byId<HTMLButtonElement>('a4-down');
const a4Up = byId<HTMLButtonElement>('a4-up');
const toneOnTap = byId<HTMLInputElement>('tone-on-tap');
const settingsDialog = byId<HTMLDialogElement>('settings');

const gauge = buildGauge(document.getElementById('gauge') as unknown as SVGSVGElement);
const settings = loadSettings();
const tracker = new Tracker();
tracker.setA4(settings.a4);

let phase: Phase = 'idle';
let mode: TargetMode = 'auto';
let reading: Reading | null = null;
let audioContext: AudioContext | null = null;
let analyzer: Analyzer | null = null;
let frame = new Float32Array(0);
let mic: Mic | null = null;
let wakeLock: WakeLockSentinel | null = null;
/** 页面切到后台时自动停了麦克风，回到前台要接着听。 */
let resumeWhenVisible = false;
/** 参考音在这个时间点之前还在响，期间不拾音，免得调音器听到自己。 */
let toneUntilMs = 0;
let tonedString = 0;

let loopId = 0;
let lastFrameMs = 0;
let lastAnalysisMs = 0;
let needleCents = NEEDLE_REST_CENTS;

const stringButtons = STRINGS.map((string, index) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'string';
  button.dataset.wound = String(index < 3);
  button.style.setProperty('--thickness', `${[5, 4, 3, 2, 1.5, 1][index]}px`);
  button.setAttribute('aria-pressed', 'false');
  button.setAttribute('aria-label', `${string.number} 弦 ${string.label}`);
  button.innerHTML = `
    <span class="string-number">${string.number}</span>
    <span class="string-wire"></span>
    <span class="string-name">${string.label[0]}<sub>${string.label[1]}</sub></span>`;
  button.addEventListener('click', () => selectString(index));
  fretboard.append(button);
  return button;
});

function setText(node: HTMLElement, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}

function formatCents(cents: number): string {
  const rounded = Math.round(cents);
  if (rounded === 0) return '0';
  return `${rounded > 0 ? '+' : '−'}${Math.abs(rounded)}`;
}

function tonePlaying(): boolean {
  return performance.now() < toneUntilMs;
}

/** 根据当前状态刷新整个界面（指针位置除外，指针在 loop 里逐帧移动）。 */
function render(): void {
  const live = phase === 'listening' && reading !== null && !tonePlaying();
  const target = live ? reading!.stringIndex : typeof mode === 'number' ? mode : null;

  let state: string = phase;
  let status = '';
  if (tonePlaying()) {
    state = 'tone';
    status = `正在播放 ${STRINGS[tonedString].number} 弦的参考音 ${STRINGS[tonedString].label}`;
  } else if (phase === 'idle') {
    status = '点「开始调音」，然后拨一根弦';
  } else if (phase === 'starting') {
    status = '正在打开麦克风…';
  } else if (!reading) {
    status = typeof mode === 'number' ? `拨 ${STRINGS[mode].number} 弦` : '拨一根弦';
  } else {
    const string = `${STRINGS[reading.stringIndex].number} 弦`;
    const far = Math.abs(reading.cents) > GAUGE_MAX_CENTS;
    if (reading.inTune) {
      state = 'intune';
      status = `${string}调准了`;
    } else if (reading.cents < 0) {
      state = 'flat';
      status = far ? `${string}偏低很多，继续拧紧` : `${string}偏低，拧紧一点`;
    } else {
      state = 'sharp';
      status = far ? `${string}偏高很多，继续放松` : `${string}偏高，放松一点`;
    }
  }
  app.dataset.state = state;
  app.dataset.held = String(live && reading!.held);
  setText(statusText, status);

  if (live) {
    const name = noteName(reading!.midi);
    setText(noteLetter, name.letter);
    noteSharp.hidden = !name.sharp;
    setText(noteOctave, String(name.octave));
    setText(frequencyText, reading!.frequency.toFixed(1));
    setText(centsText, formatCents(reading!.cents));
  } else {
    // 音名和偏差留空，由样式画一条占位线
    setText(noteLetter, '');
    noteSharp.hidden = true;
    setText(noteOctave, '');
    setText(frequencyText, '–');
    setText(centsText, '');
  }

  stringButtons.forEach((button, index) => {
    button.setAttribute('aria-pressed', String(mode === index));
    button.dataset.target = String(target === index);
    button.dataset.ringing = String(live && !reading!.held && target === index);
  });
  autoButton.setAttribute('aria-pressed', String(mode === 'auto'));
  setText(
    stringsHint,
    typeof mode === 'number'
      ? `只调 ${STRINGS[mode].number} 弦 ${STRINGS[mode].label}`
      : settings.toneOnTap
        ? '点琴弦可以选弦并听参考音'
        : '点琴弦可以手动选弦',
  );

  setText(toggleButton, phase === 'listening' ? '停止' : phase === 'starting' ? '正在打开麦克风…' : '开始调音');
  toggleButton.disabled = phase === 'starting';
  toggleButton.classList.toggle('is-quiet', phase === 'listening');

  setText(a4Label, String(settings.a4));
  setText(a4Value, String(settings.a4));
  a4Down.disabled = settings.a4 <= A4_MIN;
  a4Up.disabled = settings.a4 >= A4_MAX;
  toneOnTap.checked = settings.toneOnTap;
}

function loop(nowMs: number): void {
  loopId = 0;
  const elapsedMs = Math.min(100, nowMs - lastFrameMs);
  lastFrameMs = nowMs;

  if (phase === 'listening' && mic && analyzer && nowMs - lastAnalysisMs >= ANALYSIS_INTERVAL_MS) {
    lastAnalysisMs = nowMs;
    if (tonePlaying()) {
      tracker.reset();
      reading = null;
    } else {
      mic.analyser.getFloatTimeDomainData(frame);
      reading = tracker.update(analyzer.analyze(frame), nowMs);
    }
    render();
  }

  const showing = phase === 'listening' && reading !== null && !tonePlaying();
  const goal = showing ? reading!.cents : NEEDLE_REST_CENTS;
  const clampedGoal = Math.max(-GAUGE_MAX_CENTS, Math.min(GAUGE_MAX_CENTS, goal));
  needleCents += (clampedGoal - needleCents) * (1 - Math.exp(-elapsedMs / NEEDLE_EASE_MS));
  const settled = Math.abs(clampedGoal - needleCents) < 0.05;
  if (settled) needleCents = clampedGoal;
  gauge.setCents(needleCents);

  // 停止拾音后，等指针回到停靠位置、参考音播完再停下循环
  if (phase === 'listening' || !settled || tonePlaying()) {
    scheduleLoop();
  } else {
    render();
  }
}

function scheduleLoop(): void {
  if (loopId === 0) loopId = requestAnimationFrame(loop);
}

function getAudioContext(): AudioContext {
  audioContext ??= new AudioContext({ latencyHint: 'interactive' });
  if (audioContext.state === 'suspended') void audioContext.resume();
  return audioContext;
}

async function keepScreenOn(): Promise<void> {
  if (!('wakeLock' in navigator)) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
  } catch {
    // 省电模式等情况下系统会拒绝；屏幕按系统设置熄灭，不影响调音
  }
}

function showNotice(text: string): void {
  notice.textContent = text;
  notice.hidden = text === '';
  // 矮屏上提示可能被挤到屏幕外，滚到能看见的位置
  if (text !== '') notice.scrollIntoView({ block: 'nearest' });
}

async function start(): Promise<void> {
  if (phase !== 'idle') return;
  phase = 'starting';
  showNotice('');
  render();

  // AudioContext 必须在点击事件里同步创建，否则 iOS Safari 不出声也不采集
  const context = getAudioContext();
  analyzer = createAnalyzer(context.sampleRate);
  frame = new Float32Array(analyzer.frameSize);
  try {
    mic = await openMic(context, analyzer.frameSize, onMicEnded);
  } catch (error) {
    if (!(error instanceof MicError)) throw error;
    phase = 'idle';
    showNotice(
      error.kind === 'unknown' && error.message
        ? `${MIC_ERROR_TEXT.unknown}（${error.message}）`
        : MIC_ERROR_TEXT[error.kind],
    );
    render();
    return;
  }

  phase = 'listening';
  // 调音时不弹升级窗口，停下来再提示
  pwa.setPromptBlocked(true);
  tracker.reset();
  reading = null;
  lastFrameMs = performance.now();
  void keepScreenOn();
  render();
  scheduleLoop();
}

function stop(): void {
  mic?.stop();
  mic = null;
  void wakeLock?.release();
  wakeLock = null;
  tracker.reset();
  reading = null;
  phase = 'idle';
  pwa.setPromptBlocked(false);
  render();
  scheduleLoop();
}

function onMicEnded(): void {
  stop();
  showNotice('麦克风断开了。点「开始调音」重新连接。');
}

function selectString(index: number): void {
  mode = index;
  tracker.setMode(index);
  if (settings.toneOnTap) {
    const context = getAudioContext();
    playTone(context, midiToFrequency(STRINGS[index].midi, settings.a4));
    tonedString = index;
    toneUntilMs = performance.now() + TONE_SECONDS * 1000 + TONE_TAIL_MS;
  }
  // 重新触发拨弦动画
  const wire = stringButtons[index].querySelector('.string-wire')!;
  wire.classList.remove('is-plucked');
  void wire.getBoundingClientRect();
  wire.classList.add('is-plucked');
  lastFrameMs = performance.now();
  render();
  scheduleLoop();
}

function changeA4(value: number): void {
  settings.a4 = clampA4(value);
  saveSettings(settings);
  tracker.setA4(settings.a4);
  reading = null;
  render();
}

toggleButton.addEventListener('click', () => {
  if (phase === 'listening') stop();
  else void start();
});

autoButton.addEventListener('click', () => {
  mode = 'auto';
  tracker.setMode('auto');
  render();
});

byId('open-settings').addEventListener('click', () => settingsDialog.showModal());
// 点对话框外面的遮罩关闭
settingsDialog.addEventListener('click', (event) => {
  if (event.target === settingsDialog) settingsDialog.close();
});
a4Down.addEventListener('click', () => changeA4(settings.a4 - 1));
a4Up.addEventListener('click', () => changeA4(settings.a4 + 1));
byId('a4-reset').addEventListener('click', () => changeA4(A4_DEFAULT));
toneOnTap.addEventListener('change', () => {
  settings.toneOnTap = toneOnTap.checked;
  saveSettings(settings);
  render();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    // 切到后台就放开麦克风，不在用户看不见的时候继续听
    resumeWhenVisible = phase === 'listening';
    if (resumeWhenVisible) stop();
  } else if (resumeWhenVisible) {
    resumeWhenVisible = false;
    void start();
  }
});

byId('version').textContent = `TunePick ${APP_VERSION}（构建 ${APP_BUILD}）`;
gauge.setCents(needleCents);
render();

setupUpdateUi(pwa);
// 等页面空闲再注册 Service Worker，不和首屏抢带宽
pwa.startWhenIdle();
