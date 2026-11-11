const SVG_NS = 'http://www.w3.org/2000/svg';

/** 仪表盘两端对应的偏差（音分）。超出的偏差指针停在端点。 */
export const GAUGE_MAX_CENTS = 50;
/** 调准区间的半宽（音分），和读数稳定里的调准门限一致。 */
const IN_TUNE_CENTS = 5;

const DEGREES_PER_CENT = 1.1;
const CENTER_X = 150;
const CENTER_Y = 172;
const RADIUS = 140;

export interface Gauge {
  /** 把指针转到某个偏差（音分）对应的位置。 */
  setCents(cents: number): void;
}

function point(radius: number, cents: number): [number, number] {
  const angle = (cents * DEGREES_PER_CENT * Math.PI) / 180;
  return [CENTER_X + radius * Math.sin(angle), CENTER_Y - radius * Math.cos(angle)];
}

function element(name: string, attributes: Record<string, string | number>): SVGElement {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  return node;
}

function arc(radius: number, fromCents: number, toCents: number): string {
  const [x1, y1] = point(radius, fromCents);
  const [x2, y2] = point(radius, toCents);
  return `M ${x1} ${y1} A ${radius} ${radius} 0 0 1 ${x2} ${y2}`;
}

/** 在 svg 里画出刻度、调准区间和指针。 */
export function buildGauge(svg: SVGSVGElement): Gauge {
  svg.setAttribute('viewBox', '0 0 300 186');

  svg.append(
    element('path', { class: 'gauge-arc', d: arc(RADIUS, -GAUGE_MAX_CENTS, GAUGE_MAX_CENTS) }),
    element('path', { class: 'gauge-zone', d: arc(RADIUS, -IN_TUNE_CENTS, IN_TUNE_CENTS) }),
  );

  for (let cents = -GAUGE_MAX_CENTS; cents <= GAUGE_MAX_CENTS; cents += 5) {
    if (cents === 0) continue;
    const major = cents % 10 === 0;
    const [x1, y1] = point(RADIUS - 5, cents);
    const [x2, y2] = point(RADIUS - (major ? 19 : 12), cents);
    svg.append(element('line', { class: major ? 'gauge-tick is-major' : 'gauge-tick', x1, y1, x2, y2 }));
  }

  const labels: [number, string][] = [
    [-GAUGE_MAX_CENTS, '♭'],
    [-40, '40'],
    [-20, '20'],
    [20, '20'],
    [40, '40'],
    [GAUGE_MAX_CENTS, '♯'],
  ];
  for (const [cents, text] of labels) {
    const [x, y] = point(RADIUS + 15, cents);
    const symbol = Math.abs(cents) === GAUGE_MAX_CENTS;
    const label = element('text', {
      class: symbol ? 'gauge-label is-symbol' : 'gauge-label',
      x,
      y: y + (symbol ? 6 : 4.5),
      'text-anchor': 'middle',
    });
    label.textContent = text;
    svg.append(label);
  }

  const needle = element('polygon', {
    class: 'gauge-needle',
    points: `${CENTER_X - 2.6},${CENTER_Y} ${CENTER_X - 0.7},${CENTER_Y - RADIUS + 8} ${CENTER_X + 0.7},${CENTER_Y - RADIUS + 8} ${CENTER_X + 2.6},${CENTER_Y}`,
  });
  svg.append(needle, element('circle', { class: 'gauge-cap', cx: CENTER_X, cy: CENTER_Y, r: 7.5 }));

  return {
    setCents(cents) {
      const clamped = Math.max(-GAUGE_MAX_CENTS, Math.min(GAUGE_MAX_CENTS, cents));
      needle.setAttribute(
        'transform',
        `rotate(${(clamped * DEGREES_PER_CENT).toFixed(2)} ${CENTER_X} ${CENTER_Y})`,
      );
    },
  };
}
