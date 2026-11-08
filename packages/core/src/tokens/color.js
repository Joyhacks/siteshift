// Color parsing and math. Computed styles arrive as rgb(), oklch(), oklab() or color().
// Comparisons happen in OKLab, where equal distances look roughly equally different.

const COLOR_FN = /\b(?:rgba?|oklch|oklab|color)\([^()]*\)/gi;

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

/** Every color function inside a CSS value, e.g. a border or box-shadow. */
export function findColors(value) {
  if (!value) return [];
  return value.match(COLOR_FN) ?? [];
}

/** Removes color functions from a value, leaving lengths and keywords. */
export function stripColors(value) {
  return (value ?? '').replace(COLOR_FN, ' ');
}

function number(token, percentScale = 1) {
  if (token === undefined || token === 'none') return 0;
  if (token.endsWith('%')) return (parseFloat(token) / 100) * percentScale;
  return parseFloat(token);
}

function oklabToLinearRgb(L, a, b) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

/**
 * Parses a computed CSS color into sRGB channels from 0 to 1 plus alpha.
 * Returns null for values it does not understand.
 */
export function parseColor(value) {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  if (v === 'transparent') return { r: 0, g: 0, b: 0, alpha: 0 };

  const match = v.match(/^(rgba?|oklch|oklab|color)\((.*)\)$/);
  if (!match) return null;
  const [, fn, inner] = match;

  const [main, alphaPart] = inner.split('/');
  const parts = main.split(/[\s,]+/).filter(Boolean);
  let alpha = alphaPart?.trim();
  let rgb;

  if (fn === 'rgb' || fn === 'rgba') {
    if (parts.length < 3) return null;
    if (alpha === undefined && parts.length >= 4) alpha = parts[3];
    rgb = parts.slice(0, 3).map((p) => number(p, 255) / 255);
  } else if (fn === 'oklch' || fn === 'oklab') {
    if (parts.length < 3) return null;
    const L = number(parts[0], 1);
    let a;
    let b;
    if (fn === 'oklch') {
      const chroma = number(parts[1], 0.4);
      const hue = (parseFloat(parts[2]) || 0) * (Math.PI / 180);
      a = chroma * Math.cos(hue);
      b = chroma * Math.sin(hue);
    } else {
      a = number(parts[1], 0.4);
      b = number(parts[2], 0.4);
    }
    rgb = oklabToLinearRgb(L, a, b).map(toGamma);
  } else {
    const space = parts.shift();
    if (parts.length < 3) return null;
    const [x, y, z] = parts.slice(0, 3).map((p) => number(p, 1));
    if (space === 'srgb') {
      rgb = [x, y, z];
    } else if (space === 'srgb-linear') {
      rgb = [x, y, z].map(toGamma);
    } else if (space === 'display-p3') {
      const [lr, lg, lb] = [x, y, z].map(toLinear);
      rgb = [
        1.2249401 * lr - 0.2249404 * lg,
        -0.0420569 * lr + 1.0420571 * lg,
        -0.0196376 * lr - 0.0786361 * lg + 1.0982735 * lb,
      ].map(toGamma);
    } else {
      return null;
    }
  }

  const a = alpha === undefined ? 1 : number(alpha, 1);
  if (![...rgb, a].every(Number.isFinite)) return null;
  return { r: clamp01(rgb[0]), g: clamp01(rgb[1]), b: clamp01(rgb[2]), alpha: clamp01(a) };
}

export function toHex({ r, g, b }) {
  return `#${[r, g, b].map((c) => Math.round(clamp01(c) * 255).toString(16).padStart(2, '0')).join('')}`;
}

export function toOklab({ r, g, b }) {
  const [lr, lg, lb] = [r, g, b].map(toLinear);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

export const labDistance = (p, q) => Math.hypot(p.L - q.L, p.a - q.a, p.b - q.b);
export const labChroma = (lab) => Math.hypot(lab.a, lab.b);

function luminance({ r, g, b }) {
  const [lr, lg, lb] = [r, g, b].map(toLinear);
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

/** WCAG contrast ratio between two colors, from 1 to 21. */
export function contrastRatio(c1, c2) {
  const [hi, lo] = [luminance(c1), luminance(c2)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
