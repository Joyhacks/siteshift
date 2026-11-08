// Turns captured computed styles into a design system: colors with roles,
// fonts, a responsive type scale, spacing, radii, shadows and container width.
// Pure functions only, so every rule here is unit-testable without a browser.

import {
  contrastRatio,
  findColors,
  labChroma,
  labDistance,
  parseColor,
  stripColors,
  toHex,
  toOklab,
} from './color.js';

export const TOKENS_VERSION = 1;

const HEADINGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
const INTERACTIVE = new Set(['a', 'button']);
const OPAQUE = 0.95;
const MERGE_DISTANCE = 0.012; // OKLab distance under which two colors count as one (rounding noise, not design intent)
const CHROMATIC = 0.04; // OKLab chroma above which a color reads as a brand color
const STEPS_ABOVE = ['lg', 'xl', '2xl', '3xl', '4xl', '5xl', '6xl', '7xl', '8xl', '9xl'];
const STEPS_BELOW = ['sm', 'xs', '2xs', '3xs'];
const SIZE_NAMES = ['sm', 'md', 'lg', 'xl', '2xl', '3xl'];
const MAX_TYPE_STEPS = 10;
const MAX_PALETTE = 12;

// ---------- helpers ----------

/** Pixel value of a computed length like "16px". Anything else returns null. */
export function px(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || !value.trim().endsWith('px')) return null;
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

const round = (n, digits = 2) => Math.round(n * 10 ** digits) / 10 ** digits;
const half = (n) => Math.round(n * 2) / 2;
const textLength = (el) => el.text?.length ?? 0;
const areaOf = (el) => Math.max(0, el.rect?.w ?? 0) * Math.max(0, el.rect?.h ?? 0);
const sum = (items, pick) => items.reduce((total, item) => total + pick(item), 0);

function tally(map, key, amount = 1) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function topKey(map) {
  let best;
  let bestValue = -Infinity;
  for (const [key, value] of map) {
    if (value > bestValue) {
      best = key;
      bestValue = value;
    }
  }
  return best;
}

function maxBy(items, score) {
  let best = null;
  let bestScore = -Infinity;
  for (const item of items) {
    const s = score(item);
    if (s > bestScore) {
      best = item;
      bestScore = s;
    }
  }
  return best;
}

/** Shortens text to about 60 characters without cutting a word in half. */
function sampleText(text, max = 60) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max + 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max / 2 ? cut.slice(0, lastSpace) : text.slice(0, max)).trimEnd()}…`;
}

function firstFamily(stack) {
  return stack.split(',')[0].trim().replace(/^["']|["']$/g, '');
}

// ---------- colors ----------

function collectColors(elements) {
  const entries = new Map();
  const pairs = [];
  const totals = { text: 0, background: 0, border: 0 };

  const add = (raw, use, amount, interactiveUse) => {
    const color = parseColor(raw);
    if (!color || color.alpha < OPAQUE || amount <= 0) return null;
    const hex = toHex(color);
    let entry = entries.get(hex);
    if (!entry) {
      entry = { hex, color, lab: toOklab(color), text: 0, background: 0, border: 0, interactiveBg: 0, interactiveText: 0 };
      entries.set(hex, entry);
    }
    entry[use] += amount;
    totals[use] += amount;
    if (interactiveUse) entry[interactiveUse] += amount;
    return entry;
  };

  for (const el of elements) {
    const style = el.style ?? {};
    const chars = textLength(el);
    const interactive = INTERACTIVE.has(el.tag);

    if (chars > 0) add(style.color, 'text', chars, interactive ? 'interactiveText' : null);
    const bg = add(style['background-color'], 'background', areaOf(el), interactive ? 'interactiveBg' : null);

    if (interactive && bg) {
      const text = parseColor(style.color);
      pairs.push({ bg: bg.hex, text: text ? toHex(text) : null });
    }

    for (const side of ['border-top', 'border-right', 'border-bottom', 'border-left']) {
      const value = style[side] ?? '';
      const width = px(value.split(/\s+/)[0]);
      if (width > 0 && !/\b(none|hidden)\b/.test(value)) {
        for (const c of findColors(value)) add(c, 'border', 1);
      }
    }
  }

  return { entries: [...entries.values()], pairs, totals };
}

function clusterColors(entries, totals) {
  const share = (e) =>
    (totals.text ? e.text / totals.text : 0) +
    (totals.background ? e.background / totals.background : 0) +
    0.5 * (totals.border ? e.border / totals.border : 0);

  const ranked = entries.map((e) => ({ ...e, score: share(e) })).sort((p, q) => q.score - p.score);
  const clusters = [];
  const byHex = new Map();
  const fields = ['score', 'text', 'background', 'border', 'interactiveBg', 'interactiveText'];

  for (const entry of ranked) {
    let cluster = clusters.find((c) => labDistance(c.lab, entry.lab) < MERGE_DISTANCE);
    if (!cluster) {
      cluster = { hex: entry.hex, color: entry.color, lab: entry.lab, members: [] };
      for (const f of fields) cluster[f] = 0;
      clusters.push(cluster);
    }
    for (const f of fields) cluster[f] += entry[f];
    cluster.members.push(entry.hex);
    byHex.set(entry.hex, cluster);
  }

  clusters.sort((p, q) => q.score - p.score);
  return { clusters, byHex };
}

function assignRoles({ clusters, byHex, pairs, elements, notes }) {
  const body = elements.find((el) => el.tag === 'body');
  const pageArea = body ? areaOf(body) : Math.max(0, ...elements.map(areaOf));

  const bodyBg = body ? parseColor(body.style?.['background-color']) : null;
  let background = bodyBg && bodyBg.alpha >= OPAQUE ? byHex.get(toHex(bodyBg)) : null;
  if (!background) {
    const largest = maxBy(clusters, (c) => c.background);
    if (largest && largest.background >= 0.5 * pageArea) background = largest;
  }
  const white = parseColor('rgb(255, 255, 255)');
  const backgroundColor = background ? background.color : white;
  if (!background) notes.push('No opaque page background was found, so the browser default white was assumed.');

  // Body text is the highest-contrast neutral the page uses in quantity;
  // muted text is a softer neutral. Raw character counts alone would crown
  // whichever one has more paragraphs.
  const textClusters = clusters.filter((c) => c.text > 0);
  const totalText = sum(textClusters, (c) => c.text);
  const contrastWithBackground = (c) => contrastRatio(c.color, backgroundColor);
  const neutralText = textClusters.filter((c) => labChroma(c.lab) < CHROMATIC);
  const significantText = neutralText.filter((c) => c.text >= 0.1 * totalText);
  const foreground =
    maxBy(significantText, contrastWithBackground) ??
    maxBy(neutralText, (c) => c.text) ??
    maxBy(textClusters, (c) => c.text);
  const foregroundColor = foreground ? foreground.color : parseColor('rgb(0, 0, 0)');

  const totalInteractiveBg = sum(clusters, (c) => c.interactiveBg);
  const totalInteractiveText = sum(clusters, (c) => c.interactiveText);
  const brandScore = (c) =>
    (totalInteractiveBg ? (2 * c.interactiveBg) / totalInteractiveBg : 0) +
    (totalInteractiveText ? c.interactiveText / totalInteractiveText : 0) +
    c.score;

  let primary = maxBy(
    clusters.filter((c) => c !== background && labChroma(c.lab) >= CHROMATIC),
    brandScore,
  );
  if (!primary) {
    primary = maxBy(clusters.filter((c) => c !== background && c.interactiveBg > 0), (c) => c.interactiveBg);
  }
  const primaryColor = primary ? primary.color : foregroundColor;

  const onPrimary = new Map();
  if (primary) {
    for (const pair of pairs) {
      if (byHex.get(pair.bg) !== primary || !pair.text) continue;
      tally(onPrimary, byHex.get(pair.text)?.hex ?? pair.text);
    }
  }
  let primaryForeground = topKey(onPrimary) ?? null;
  if (!primaryForeground) {
    const black = parseColor('rgb(0, 0, 0)');
    primaryForeground = contrastRatio(white, primaryColor) >= contrastRatio(black, primaryColor) ? '#ffffff' : '#000000';
  }

  const foregroundContrast = foreground ? contrastWithBackground(foreground) : 21;
  const muted = maxBy(
    neutralText.filter((c) => c !== foreground && c !== primary && contrastWithBackground(c) < foregroundContrast),
    (c) => c.text,
  );

  const backgroundLab = toOklab(backgroundColor);
  const neutralSurfaces = clusters
    .filter((c) => c.background > 0 && c !== background && labChroma(c.lab) < 0.08)
    .filter((c) => labDistance(c.lab, backgroundLab) >= MERGE_DISTANCE)
    .sort((p, q) => q.background - p.background);
  const surface = neutralSurfaces.find((c) => contrastRatio(c.color, backgroundColor) < 3) ?? null;
  const inverse = neutralSurfaces.find((c) => contrastRatio(c.color, backgroundColor) >= 3) ?? null;

  const border = maxBy(clusters.filter((c) => c.border > 0), (c) => c.border);

  return {
    background: toHex(backgroundColor),
    surface: surface?.hex ?? null,
    inverse: inverse?.hex ?? null,
    foreground: toHex(foregroundColor),
    muted: muted?.hex ?? null,
    primary: toHex(primaryColor),
    primaryForeground,
    border: border?.hex ?? null,
  };
}

function contrastChecks(roles) {
  const checks = [
    ['Body text on background', roles.foreground, roles.background],
    ['Muted text on background', roles.muted, roles.background],
    ['Text on primary', roles.primaryForeground, roles.primary],
  ];
  return checks
    .filter(([, fg, bg]) => fg && bg)
    .map(([label, fg, bg]) => {
      const ratio = round(contrastRatio(parseColor(hexToRgb(fg)), parseColor(hexToRgb(bg))), 2);
      return { label, foreground: fg, background: bg, ratio, passesAA: ratio >= 4.5 };
    });
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

export function analyzeColors(elements, notes = []) {
  const { entries, pairs, totals } = collectColors(elements);
  const { clusters, byHex } = clusterColors(entries, totals);
  const roles = assignRoles({ clusters, byHex, pairs, elements, notes });

  const totalScore = sum(clusters, (c) => c.score) || 1;
  const roleNames = (hex) => Object.entries(roles).filter(([, v]) => v === hex).map(([k]) => k);
  const palette = clusters.slice(0, MAX_PALETTE).map((c) => ({
    hex: c.hex,
    share: round((c.score / totalScore) * 100, 1),
    roles: roleNames(c.hex),
    variants: c.members.length,
  }));

  return { roles, palette, contrast: contrastChecks(roles) };
}

// ---------- fonts ----------

export function analyzeFonts(textElements) {
  const families = new Map();
  for (const el of textElements) {
    const stack = el.style?.['font-family'];
    if (!stack) continue;
    const name = firstFamily(stack);
    let family = families.get(name);
    if (!family) {
      family = { name, stack, chars: 0, headingChars: 0, weights: new Map() };
      families.set(name, family);
    }
    const chars = textLength(el);
    family.chars += chars;
    if (HEADINGS.has(el.tag)) family.headingChars += chars;
    tally(family.weights, Number(el.style['font-weight']) || 400, chars);
  }

  const list = [...families.values()].sort((p, q) => q.chars - p.chars);
  const format = (f) =>
    f && { name: f.name, stack: f.stack, weights: [...f.weights.keys()].sort((p, q) => p - q) };

  let heading = maxBy(list.filter((f) => f.headingChars > 0), (f) => f.headingChars);
  if (!heading && textElements.length) {
    const largest = maxBy(textElements, (el) => px(el.style?.['font-size']) ?? 0);
    heading = families.get(firstFamily(largest.style?.['font-family'] ?? '')) ?? null;
  }
  const body = maxBy(list, (f) => f.chars - f.headingChars);

  return { heading: format(heading), body: format(body), all: list.map(format) };
}

// ---------- type scale ----------

export function analyzeType(textElements, mobileElements = []) {
  const mobileSize = new Map();
  for (const el of mobileElements) {
    const size = px(el.style?.['font-size']);
    if (textLength(el) > 0 && size) mobileSize.set(el.path, half(size));
  }

  const steps = new Map();
  for (const el of textElements) {
    const size = px(el.style?.['font-size']);
    if (!size) continue;
    const key = half(size);
    let step = steps.get(key);
    if (!step) {
      step = { size: key, chars: 0, count: 0, bodyChars: 0, heading: false, lineHeights: new Map(), weights: new Map(), tracking: new Map(), families: new Map(), mobile: new Map(), sample: null };
      steps.set(key, step);
    }
    const chars = textLength(el);
    const isHeading = HEADINGS.has(el.tag);
    step.chars += chars;
    step.count += 1;
    if (isHeading) step.heading = true;
    else step.bodyChars += chars;

    const lineHeight = px(el.style['line-height']);
    tally(step.lineHeights, lineHeight ? String(round(lineHeight / size, 2)) : 'normal', chars);
    tally(step.weights, Number(el.style['font-weight']) || 400, chars);
    tally(step.tracking, el.style['letter-spacing'] || 'normal', chars);
    const mobile = mobileSize.get(el.path);
    if (mobile) tally(step.mobile, mobile, chars);
    if (el.style['font-family']) tally(step.families, el.style['font-family'], chars);
    if (!step.sample || (isHeading && !step.sampleFromHeading)) {
      step.sample = sampleText(el.text);
      step.sampleFromHeading = isHeading;
    }
  }

  const all = [...steps.values()];
  if (!all.length) return { base: null, scale: [] };

  const base = (maxBy(all.filter((s) => s.bodyChars > 0), (s) => s.bodyChars) ?? maxBy(all, (s) => s.chars)).size;
  // A size used once still counts when it carries real text, like an intro
  // paragraph or a pull quote. One-off labels and stray captions do not.
  const totalChars = sum(all, (s) => s.chars);
  let selected = all.filter(
    (s) => s.count >= 2 || s.heading || s.size === base || s.chars >= 0.03 * totalChars,
  );
  if (selected.length > MAX_TYPE_STEPS) {
    const keep = new Set([base]);
    for (const s of [...selected].sort((p, q) => q.chars - p.chars)) {
      if (keep.size >= MAX_TYPE_STEPS) break;
      keep.add(s.size);
    }
    selected = selected.filter((s) => keep.has(s.size));
  }

  const below = selected.filter((s) => s.size < base).sort((p, q) => q.size - p.size);
  const above = selected.filter((s) => s.size > base).sort((p, q) => p.size - q.size);
  const names = new Map([[base, 'base']]);
  below.forEach((s, i) => names.set(s.size, STEPS_BELOW[i] ?? `${i + 1}xs`));
  above.forEach((s, i) => names.set(s.size, STEPS_ABOVE[i] ?? `${i + 2}xl`));

  const scale = selected
    .sort((p, q) => p.size - q.size)
    .map((s) => {
      const lineHeight = topKey(s.lineHeights);
      const tracking = topKey(s.tracking);
      return {
        name: names.get(s.size),
        size: s.size,
        mobile: topKey(s.mobile) ?? s.size,
        lineHeight: lineHeight === 'normal' ? null : Number(lineHeight),
        weight: topKey(s.weights),
        letterSpacing: tracking && tracking !== 'normal' ? tracking : null,
        fontFamily: topKey(s.families) ?? null,
        sample: s.sample,
      };
    });

  return { base, scale };
}

// ---------- spacing, radii, shadows, containers ----------

export function analyzeSpacing(elements) {
  const counts = new Map();
  let total = 0;
  const push = (value, max) => {
    if (value && value > 0 && value <= max) {
      tally(counts, Math.round(value));
      total += 1;
    }
  };

  for (const el of elements) {
    const style = el.style ?? {};
    for (const side of ['top', 'right', 'bottom', 'left']) {
      push(px(style[`padding-${side}`]), 256);
      push(px(style[`margin-${side}`]), 128); // larger margins are usually auto-centering
    }
    for (const part of (style.gap ?? '').split(/\s+/)) push(px(part), 256);
  }

  if (!total) return { base: null, consistency: null, scale: [] };

  const shareOf = (unit) => {
    let hits = 0;
    for (const [value, count] of counts) if (value % unit === 0) hits += count;
    return hits / total;
  };
  let base = [8, 10, 6, 5, 4].find((unit) => shareOf(unit) >= 0.75) ?? null;
  if (!base && shareOf(4) >= 0.5) base = 4;

  const scale = [...counts]
    .filter(([, count]) => count >= 2)
    .sort((p, q) => q[1] - p[1])
    .slice(0, 12)
    .map(([value]) => value)
    .sort((p, q) => p - q);

  return { base, consistency: base ? Math.round(shareOf(base) * 100) : null, scale };
}

export function analyzeRadii(elements) {
  const counts = new Map();
  let full = false;

  for (const el of elements) {
    const raw = (el.style?.['border-radius'] ?? '').split(/\s+/)[0];
    if (!raw || raw === '0px') continue;
    if (raw.endsWith('%')) {
      if (parseFloat(raw) >= 50) full = true;
      continue;
    }
    const value = px(raw);
    if (!value) continue;
    const { w = 0, h = 0 } = el.rect ?? {};
    const isCircle = Math.abs(w - h) <= 1 && value >= Math.min(w, h) / 2;
    if (value >= 999 || isCircle) {
      full = true;
      continue;
    }
    tally(counts, round(value, 1));
  }

  const values = [...counts]
    .sort((p, q) => q[1] - p[1])
    .slice(0, SIZE_NAMES.length)
    .sort((p, q) => p[0] - q[0])
    .map(([value, count], i) => ({ name: SIZE_NAMES[i], value, count }));

  return { values, full };
}

export function analyzeShadows(elements) {
  const counts = new Map();
  for (const el of elements) {
    const value = el.style?.['box-shadow'];
    if (value && value !== 'none') tally(counts, value);
  }

  const blurOf = (value) => {
    const lengths = stripColors(value.split(/,(?![^(]*\))/)[0]).match(/-?[\d.]+px/g) ?? [];
    return px(lengths[2]) ?? 0;
  };

  return [...counts]
    .sort((p, q) => q[1] - p[1])
    .slice(0, 4)
    .sort((p, q) => blurOf(p[0]) - blurOf(q[0]))
    .map(([value, count], i) => ({ name: SIZE_NAMES[i], value, count }));
}

export function analyzeContainers(elements, viewportWidth) {
  const counts = new Map();
  const center = viewportWidth / 2;

  for (const el of elements) {
    const { x = 0, w = 0 } = el.rect ?? {};
    if (w >= 480 && w < viewportWidth - 1 && Math.abs(x + w / 2 - center) <= 2) tally(counts, Math.round(w));
    const maxWidth = px(el.style?.['max-width']);
    if (maxWidth && maxWidth >= 320 && maxWidth < viewportWidth * 2) tally(counts, Math.round(maxWidth));
  }

  const candidates = [...counts]
    .sort((p, q) => q[1] - p[1])
    .slice(0, 3)
    .map(([width, count]) => ({ width, count }));

  return { width: candidates[0]?.width ?? null, candidates };
}

// ---------- entry point ----------

/**
 * Builds the token set from a capture.
 * @param {{ manifest?: object, desktop: object[], mobile?: object[] }} capture
 */
export function analyzeTokens({ manifest, desktop, mobile = [] }) {
  if (!Array.isArray(desktop) || !desktop.length) {
    throw new Error('The capture has no desktop styles to analyze.');
  }
  const notes = [];
  const viewportWidth = manifest?.viewports?.desktop?.viewport?.width ?? 1440;
  const textElements = desktop.filter((el) => textLength(el) > 0);

  return {
    version: TOKENS_VERSION,
    source: manifest?.url ?? null,
    generatedAt: new Date().toISOString(),
    colors: analyzeColors(desktop, notes),
    fonts: analyzeFonts(textElements),
    type: analyzeType(textElements, mobile),
    spacing: analyzeSpacing(desktop),
    radii: analyzeRadii(desktop),
    shadows: analyzeShadows(desktop),
    container: analyzeContainers(desktop, viewportWidth),
    notes,
  };
}
