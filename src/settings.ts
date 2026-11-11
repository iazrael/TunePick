export const A4_DEFAULT = 440;
export const A4_MIN = 415;
export const A4_MAX = 466;

const STORAGE_KEY = 'tunepick.settings';

export interface Settings {
  /** 基准音 A4 的频率（Hz）。 */
  a4: number;
  /** 点琴弦时是否播放参考音。 */
  toneOnTap: boolean;
}

export function clampA4(value: number): number {
  return Math.min(A4_MAX, Math.max(A4_MIN, Math.round(value)));
}

/** 把 localStorage 里的原始字符串转成可信的设置；不合法的字段用默认值。 */
export function parseSettings(raw: string | null): Settings {
  let stored: Record<string, unknown> = {};
  if (raw !== null) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed === 'object' && parsed !== null) {
        stored = parsed as Record<string, unknown>;
      }
    } catch {
      // 内容损坏，按没保存过处理
    }
  }
  return {
    a4: typeof stored.a4 === 'number' && Number.isFinite(stored.a4) ? clampA4(stored.a4) : A4_DEFAULT,
    toneOnTap: typeof stored.toneOnTap === 'boolean' ? stored.toneOnTap : true,
  };
}

export function loadSettings(): Settings {
  try {
    return parseSettings(localStorage.getItem(STORAGE_KEY));
  } catch {
    // 隐私模式等场景下 localStorage 不可用，用默认值
    return parseSettings(null);
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // 存不了不影响本次使用，下次打开回到默认值
  }
}
