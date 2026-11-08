// Small, pure helpers that turn CSS values into Tailwind CSS v4 classes,
// preferring the generated theme tokens whenever a value matches one exactly.

import { parseColor, toHex } from '../tokens/color.js';

const ROLE_VARIABLES = {
  canvas: 'canvas',
  background: 'background',
  surface: 'surface',
  inverse: 'inverse',
  foreground: 'foreground',
  muted: 'muted',
  primary: 'primary',
  primaryForeground: 'primary-foreground',
  border: 'border',
};

const WEIGHTS = {
  100: 'font-thin',
  200: 'font-extralight',
  300: 'font-light',
  400: 'font-normal',
  500: 'font-medium',
  600: 'font-semibold',
  700: 'font-bold',
  800: 'font-extrabold',
  900: 'font-black',
};

export function px(value) {
  if (typeof value !== 'string' || !value.trim().endsWith('px')) return null;
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

const trim = (n) => String(Math.round(n * 100) / 100);

/** Escapes a raw CSS value for use inside Tailwind's [arbitrary] brackets. */
export function arbitrary(value) {
  return String(value).trim().replace(/_/g, '\\_').replace(/\s*,\s*/g, ',').replace(/\s+/g, '_');
}

/** Spacing on Tailwind's 4px scale when it fits a half step, otherwise exact pixels. */
export function spacing(prefix, value) {
  const n = typeof value === 'number' ? value : px(value);
  if (n === null || n === 0) return null;
  const negative = n < 0;
  const abs = Math.abs(n);
  const body = abs % 2 === 0 ? `${prefix}-${trim(abs / 4)}` : `${prefix}-[${trim(abs)}px]`;
  return negative ? `-${body}` : body;
}

/** Collapses four sides into the shortest Tailwind form: p-4, px-4 py-2, or one per side. */
export function sides(prefix, [top, right, bottom, left]) {
  const sideClass = (suffix, v) => spacing(`${prefix}${suffix}`, v);
  if (top === right && right === bottom && bottom === left) return [sideClass('', top)].filter(Boolean);
  if (top === bottom && left === right) return [sideClass('x', left), sideClass('y', top)].filter(Boolean);
  return [sideClass('t', top), sideClass('r', right), sideClass('b', bottom), sideClass('l', left)].filter(Boolean);
}

export function fontWeightClass(value) {
  const n = Math.round(Number(value) / 100) * 100;
  return WEIGHTS[n] ?? `font-[${arbitrary(value)}]`;
}

// When two roles share a color (white text and white cards, say), the class
// should name the role that matches its use: text-primary-foreground on a
// button label, bg-surface on a card.
const ROLE_PREFERENCE = {
  text: ['foreground', 'muted', 'primaryForeground', 'primary', 'inverse', 'background', 'surface', 'canvas', 'border'],
  bg: ['background', 'surface', 'canvas', 'inverse', 'primary', 'muted', 'foreground', 'primaryForeground', 'border'],
  border: ['border', 'muted', 'foreground', 'primary', 'surface', 'background', 'inverse', 'canvas', 'primaryForeground'],
};

/**
 * Lookup tables from token values to theme names, matching exactly what
 * theme.css declares, so generated classes reference the theme.
 */
export function createTokenLookup(tokens) {
  const byUse = { text: new Map(), bg: new Map(), border: new Map() };
  if (tokens) {
    const roleHexes = new Set(Object.values(tokens.colors.roles).filter(Boolean));
    const palette = tokens.colors.palette.filter((entry) => !roleHexes.has(entry.hex));
    for (const [use, order] of Object.entries(ROLE_PREFERENCE)) {
      for (const role of order) {
        const hex = tokens.colors.roles[role];
        if (hex && !byUse[use].has(hex)) byUse[use].set(hex, ROLE_VARIABLES[role]);
      }
      palette.forEach((entry, i) => byUse[use].set(entry.hex, `palette-${i + 1}`));
    }
  }
  const colors = byUse.bg;

  const fontSizes = new Map((tokens?.type.scale ?? []).map((step) => [step.size, step.name]));
  const radii = new Map((tokens?.radii.values ?? []).map((r) => [r.value, r.name]));
  const shadows = new Map((tokens?.shadows ?? []).map((s) => [s.value, s.name]));
  const fonts = new Map();
  if (tokens?.fonts.heading) fonts.set(tokens.fonts.heading.stack, 'heading');
  if (tokens?.fonts.body) fonts.set(tokens.fonts.body.stack, 'body');

  return { colors, colorsByUse: byUse, fontSizes, radii, shadows, fonts, container: tokens?.container.width ?? null };
}

/** bg-primary, text-[#1a1a2e], border-[rgba(0,0,0,0.1)] and so on. */
export function colorClass(prefix, value, lookup) {
  const color = parseColor(value);
  if (!color || color.alpha === 0) return null;
  if (color.alpha >= 0.995) {
    const hex = toHex(color);
    const use = prefix.startsWith('border') ? 'border' : prefix === 'text' ? 'text' : 'bg';
    const token = (lookup.colorsByUse?.[use] ?? lookup.colors).get(hex);
    return token ? `${prefix}-${token}` : `${prefix}-[${hex}]`;
  }
  return `${prefix}-[${arbitrary(value.replace(/\s+/g, ''))}]`;
}
