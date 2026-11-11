import { describe, expect, it } from 'vitest';
import { A4_DEFAULT, A4_MAX, A4_MIN, clampA4, parseSettings } from './settings';

describe('clampA4', () => {
  it('限制在允许范围内并取整', () => {
    expect(clampA4(440)).toBe(440);
    expect(clampA4(441.6)).toBe(442);
    expect(clampA4(100)).toBe(A4_MIN);
    expect(clampA4(999)).toBe(A4_MAX);
  });
});

describe('parseSettings', () => {
  it('没有保存过时用默认值', () => {
    expect(parseSettings(null)).toEqual({ a4: A4_DEFAULT, toneOnTap: true });
  });

  it('读取保存的值', () => {
    expect(parseSettings('{"a4":432,"toneOnTap":false}')).toEqual({ a4: 432, toneOnTap: false });
  });

  it('内容损坏或字段不合法时回到默认值', () => {
    expect(parseSettings('not json')).toEqual({ a4: A4_DEFAULT, toneOnTap: true });
    expect(parseSettings('{"a4":"abc","toneOnTap":1}')).toEqual({ a4: A4_DEFAULT, toneOnTap: true });
    expect(parseSettings('{"a4":9000}')).toEqual({ a4: A4_MAX, toneOnTap: true });
    expect(parseSettings('[1,2]')).toEqual({ a4: A4_DEFAULT, toneOnTap: true });
  });
});
