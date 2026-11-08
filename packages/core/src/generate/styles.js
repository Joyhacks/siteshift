// Converts one element's computed styles into Tailwind classes.
//
// Each property becomes an entry { cls, def }: the Tailwind class(es) that
// reproduce the value, and whether that value is what the element would get
// anyway (Tailwind's preflight baseline, or inherited from its parent).
// Keeping an explicit class for defaults lets the responsive merge reset a
// value on desktop that the mobile layout changed.

import {
  arbitrary,
  colorClass,
  fontWeightClass,
  px,
  sides,
  spacing,
} from './tailwind.js';

const PREFLIGHT_BLOCK = new Set(['img', 'svg', 'video', 'canvas', 'audio', 'iframe', 'embed', 'object']);
const BLOCK_TAGS = new Set([
  'body', 'div', 'section', 'header', 'footer', 'main', 'nav', 'article', 'aside', 'p', 'h1', 'h2', 'h3',
  'h4', 'h5', 'h6', 'ul', 'ol', 'form', 'figure', 'figcaption', 'blockquote', 'address', 'fieldset',
  'details', 'summary', 'dl', 'dd', 'dt', 'hr', 'pre', 'picture',
]);
const TABLE_DISPLAY = {
  table: 'table', tr: 'table-row', td: 'table-cell', th: 'table-cell',
  thead: 'table-header-group', tbody: 'table-row-group', tfoot: 'table-footer-group',
};
const DISPLAY_CLASS = {
  block: 'block', inline: 'inline', 'inline-block': 'inline-block', flex: 'flex', 'inline-flex': 'inline-flex',
  grid: 'grid', 'inline-grid': 'inline-grid', none: 'hidden', contents: 'contents', 'list-item': 'list-item',
  table: 'table', 'table-row': 'table-row', 'table-cell': 'table-cell', 'table-header-group': 'table-header-group',
  'table-row-group': 'table-row-group', 'table-footer-group': 'table-footer-group', 'flow-root': 'flow-root',
};
const REPLACED = new Set(['img', 'video', 'canvas', 'svg', 'iframe', 'picture']);
const FLOW_DISPLAYS = new Set(['block', 'flex', 'grid', 'list-item', 'table', 'flow-root']);

const JUSTIFY = {
  normal: 'justify-start', 'flex-start': 'justify-start', start: 'justify-start', left: 'justify-start',
  center: 'justify-center', 'flex-end': 'justify-end', end: 'justify-end', right: 'justify-end',
  'space-between': 'justify-between', 'space-around': 'justify-around', 'space-evenly': 'justify-evenly',
  stretch: 'justify-stretch',
};
const ALIGN = {
  normal: 'items-stretch', stretch: 'items-stretch', center: 'items-center', 'flex-start': 'items-start',
  start: 'items-start', 'self-start': 'items-start', 'flex-end': 'items-end', end: 'items-end',
  'self-end': 'items-end', baseline: 'items-baseline',
};
const SELF = {
  auto: 'self-auto', normal: 'self-auto', stretch: 'self-stretch', center: 'self-center', 'flex-start': 'self-start',
  start: 'self-start', 'flex-end': 'self-end', end: 'self-end', baseline: 'self-baseline',
};
const TEXT_ALIGN = { start: 'text-left', left: 'text-left', center: 'text-center', right: 'text-right', end: 'text-right', justify: 'text-justify' };
const TRANSFORM_CASE = { none: 'normal-case', uppercase: 'uppercase', lowercase: 'lowercase', capitalize: 'capitalize' };
const WHITESPACE = {
  normal: 'whitespace-normal', nowrap: 'whitespace-nowrap', pre: 'whitespace-pre',
  'pre-wrap': 'whitespace-pre-wrap', 'pre-line': 'whitespace-pre-line', 'break-spaces': 'whitespace-break-spaces',
};
const OVERFLOW = { visible: 'overflow-visible', hidden: 'overflow-hidden', auto: 'overflow-auto', clip: 'overflow-clip', scroll: 'overflow-scroll' };
const OBJECT_FIT = { fill: 'object-fill', cover: 'object-cover', contain: 'object-contain', none: 'object-none', 'scale-down': 'object-scale-down' };
const VERTICAL = {
  baseline: 'align-baseline', middle: 'align-middle', top: 'align-top', bottom: 'align-bottom',
  'text-top': 'align-text-top', 'text-bottom': 'align-text-bottom', sub: 'align-sub', super: 'align-super',
};
const LIST = { none: 'list-none', disc: 'list-disc', decimal: 'list-decimal', circle: 'list-[circle]', square: 'list-[square]' };

const INHERITED = ['color', 'font-family', 'font-size', 'line-height', 'font-weight', 'font-style', 'letter-spacing', 'text-align', 'text-transform', 'white-space'];

export function defaultDisplay(tag) {
  if (tag === 'li') return 'list-item';
  if (TABLE_DISPLAY[tag]) return TABLE_DISPLAY[tag];
  if (PREFLIGHT_BLOCK.has(tag) || BLOCK_TAGS.has(tag)) return 'block';
  if (['button', 'input', 'select', 'textarea'].includes(tag)) return 'inline-block';
  return 'inline';
}

const entry = (cls, def) => ({ cls: Array.isArray(cls) ? cls.filter(Boolean).join(' ') : cls, def });
const isFlex = (d) => d === 'flex' || d === 'inline-flex';
const isGrid = (d) => d === 'grid' || d === 'inline-grid';

function fourSides(style, prop) {
  return ['top', 'right', 'bottom', 'left'].map((side) => px(style[`${prop}-${side}`]) ?? 0);
}

function borderSide(value = '') {
  const width = px(value.split(/\s+/)[0]) ?? 0;
  const styleMatch = value.match(/\b(solid|dashed|dotted|double|groove|ridge|inset|outset)\b/);
  const color = value.match(/\b(?:rgba?|oklch|oklab|color)\([^()]*\)/)?.[0] ?? null;
  return { width, style: styleMatch?.[1] ?? 'solid', color };
}

function offsetClass(prefix, value) {
  if (!value || value === 'auto') return null;
  if (value.endsWith('%')) return `${prefix}-[${value}]`;
  const n = px(value);
  if (n === null) return null;
  return n === 0 ? `${prefix}-0` : spacing(prefix, n);
}

function gridColumns(value) {
  if (!value || value === 'none') return null;
  const tracks = value.split(/\s+/).map(px);
  if (!tracks.length || tracks.some((t) => t === null)) return `[grid-template-columns:${arbitrary(value)}]`;
  if (tracks.every((t) => Math.abs(t - tracks[0]) <= 1)) return `grid-cols-${tracks.length}`;
  const smallest = Math.min(...tracks);
  const fr = tracks.map((t) => `minmax(0,${Math.round((t / smallest) * 100) / 100}fr)`);
  return `grid-cols-[${fr.join('_')}]`;
}

function fontFamilyClass(stack, lookup) {
  const token = lookup.fonts.get(stack);
  return token ? `font-${token}` : `[font-family:${arbitrary(stack.replace(/"/g, "'"))}]`;
}

function fontSizeClass(value, lookup, useTokens) {
  const n = px(value);
  if (n === null) return null;
  const token = useTokens ? lookup.fontSizes.get(Math.round(n * 2) / 2) : null;
  return token ? `text-${token}` : `text-[${Math.round(n * 100) / 100}px]`;
}

function inheritedClass(prop, value, lookup, useTokens) {
  switch (prop) {
    case 'color': return colorClass('text', value, lookup) ?? 'text-transparent';
    case 'font-family': return fontFamilyClass(value, lookup);
    case 'font-size': return fontSizeClass(value, lookup, useTokens);
    case 'line-height': {
      const n = px(value);
      return n === null ? 'leading-[normal]' : `leading-[${Math.round(n * 100) / 100}px]`;
    }
    case 'font-weight': return fontWeightClass(value);
    case 'font-style': return value === 'italic' ? 'italic' : 'not-italic';
    case 'letter-spacing': {
      const n = px(value);
      return n === null || n === 0 ? 'tracking-normal' : `tracking-[${Math.round(n * 100) / 100}px]`;
    }
    case 'text-align': return TEXT_ALIGN[value] ?? 'text-left';
    case 'text-transform': return TRANSFORM_CASE[value] ?? 'normal-case';
    case 'white-space': return WHITESPACE[value] ?? 'whitespace-normal';
    default: return null;
  }
}

/**
 * @param {object} el captured element
 * @param {object|null} parent captured parent element in the same viewport
 * @param {object} ctx { lookup, useTokens, hasChildren, assetUrl(url) }
 * @returns {Map<string, {cls: string, def: boolean}>}
 */
export function classMap(el, parent, ctx) {
  const map = new Map();
  const s = el.style ?? {};
  const ps = parent?.style ?? {};
  const { lookup } = ctx;
  const display = s.display || defaultDisplay(el.tag);
  const parentDisplay = ps.display || 'block';
  const position = s.position || 'static';

  // Text properties: emitted when they differ from what the parent passes down.
  for (const prop of INHERITED) {
    const value = s[prop];
    if (!value) continue;
    const cls = inheritedClass(prop, value, lookup, ctx.useTokens);
    if (!cls) continue;
    const def = parent ? ps[prop] === value : false;
    map.set(prop, entry(cls, def));
  }
  // A font-size token carries its own line height, so the real one must be explicit.
  const size = map.get('font-size');
  if (size && !size.def && /^text-(?!\[)/.test(size.cls) && map.has('line-height')) map.get('line-height').def = false;

  const decoration = s['text-decoration-line'] || 'none';
  map.set('decoration', entry(decoration.includes('underline') ? 'underline' : decoration.includes('line-through') ? 'line-through' : 'no-underline', !/underline|line-through/.test(decoration)));

  map.set('display', entry(DISPLAY_CLASS[display] ?? `[display:${arbitrary(display)}]`, display === defaultDisplay(el.tag)));

  // Positioning
  map.set('position', entry(position, position === 'static'));
  const insets = position === 'static' ? [] : ['top', 'right', 'bottom', 'left'].map((side) => offsetClass(side, s[side]));
  map.set('inset', entry(insets.filter(Boolean).length ? insets : 'inset-auto', insets.filter(Boolean).length === 0));
  const z = s['z-index'];
  map.set('z', entry(z && z !== 'auto' ? `z-[${z}]` : 'z-auto', !z || z === 'auto'));

  // Flex and grid containers
  const container = isFlex(display) || isGrid(display);
  if (isFlex(display)) {
    const dir = s['flex-direction'] || 'row';
    map.set('flex-direction', entry({ row: 'flex-row', column: 'flex-col', 'row-reverse': 'flex-row-reverse', 'column-reverse': 'flex-col-reverse' }[dir] ?? 'flex-row', dir === 'row'));
    const wrap = s['flex-wrap'] || 'nowrap';
    map.set('flex-wrap', entry({ nowrap: 'flex-nowrap', wrap: 'flex-wrap', 'wrap-reverse': 'flex-wrap-reverse' }[wrap] ?? 'flex-nowrap', wrap === 'nowrap'));
  }
  if (isGrid(display)) {
    const cols = gridColumns(s['grid-template-columns']);
    map.set('grid-cols', entry(cols ?? 'grid-cols-none', !cols));
  }
  if (container) {
    const justify = s['justify-content'] || 'normal';
    map.set('justify', entry(JUSTIFY[justify] ?? `[justify-content:${arbitrary(justify)}]`, ['normal', 'flex-start', 'start'].includes(justify)));
    const align = s['align-items'] || 'normal';
    map.set('align', entry(ALIGN[align] ?? `[align-items:${arbitrary(align)}]`, ['normal', 'stretch'].includes(align)));
    const gap = (s.gap || 'normal').split(/\s+/).map(px);
    const [row, col = row] = gap;
    let gapCls;
    if (!row && !col) gapCls = null;
    else if (row === col) gapCls = spacing('gap', row);
    else gapCls = [spacing('gap-y', row), spacing('gap-x', col)];
    map.set('gap', entry(gapCls ?? 'gap-0', !gapCls || (Array.isArray(gapCls) && !gapCls.some(Boolean))));
  }

  // Flex and grid items
  if (isFlex(parentDisplay)) {
    const grow = Number(s['flex-grow'] || 0);
    map.set('grow', entry(grow === 0 ? 'grow-0' : grow === 1 ? 'grow' : `grow-[${grow}]`, grow === 0));
    const shrink = Number(s['flex-shrink'] ?? 1);
    map.set('shrink', entry(shrink === 1 ? 'shrink' : shrink === 0 ? 'shrink-0' : `shrink-[${shrink}]`, shrink === 1));
    const basis = s['flex-basis'] || 'auto';
    const basisCls = basis === 'auto' ? 'basis-auto' : px(basis) === 0 ? 'basis-0' : `basis-[${arbitrary(basis)}]`;
    map.set('basis', entry(basisCls, basis === 'auto'));
  }
  if (isFlex(parentDisplay) || isGrid(parentDisplay)) {
    const self = s['align-self'] || 'auto';
    map.set('self', entry(SELF[self] ?? 'self-auto', self === 'auto' || self === 'normal'));
    const order = Number(s.order || 0);
    map.set('order', entry(order ? `order-[${order}]` : 'order-none', order === 0));
  }

  // Box model
  const padding = fourSides(s, 'padding');
  map.set('padding', entry(padding.some(Boolean) ? sides('p', padding) : 'p-0', !padding.some(Boolean)));

  const margin = fourSides(s, 'margin');
  const parentFlows = !container && !isFlex(parentDisplay) && !isGrid(parentDisplay);
  const centered = parentFlows && FLOW_DISPLAYS.has(display) && margin[1] > 0 && Math.abs(margin[1] - margin[3]) <= 1;
  let marginCls;
  if (centered) {
    const vertical = margin[0] === margin[2] ? [spacing('my', margin[0])] : [spacing('mt', margin[0]), spacing('mb', margin[2])];
    marginCls = [...vertical, 'mx-auto'];
  } else {
    marginCls = margin.some(Boolean) ? sides('m', margin) : null;
  }
  map.set('margin', entry(marginCls ?? 'm-0', !marginCls || !marginCls.filter(Boolean).length));

  addSizing(map, el, parent, { display, parentDisplay, position, ctx });

  // Borders
  const edges = ['top', 'right', 'bottom', 'left'].map((side) => borderSide(s[`border-${side}`]));
  if (edges.some((e) => e.width > 0)) {
    const allSame = edges.every((e) => e.width === edges[0].width && e.color === edges[0].color);
    const cls = [];
    if (allSame) {
      cls.push(edges[0].width === 1 ? 'border' : `border-[${edges[0].width}px]`);
      if (edges[0].color) cls.push(colorClass('border', edges[0].color, lookup));
    } else {
      edges.forEach((e, i) => {
        if (!e.width) return;
        const side = 'trbl'[i];
        cls.push(e.width === 1 ? `border-${side}` : `border-${side}-[${e.width}px]`);
        if (e.color) cls.push(colorClass(`border-${side}`, e.color, lookup));
      });
    }
    const borderStyle = edges.find((e) => e.width > 0).style;
    if (borderStyle !== 'solid') cls.push(`border-${borderStyle}`);
    map.set('border', entry(cls, false));
  } else {
    map.set('border', entry('border-0', true));
  }

  const radius = s['border-radius'] || '0px';
  map.set('radius', entry(radiusClass(radius, lookup), radius === '0px'));

  // Backgrounds and effects
  const bg = colorClass('bg', s['background-color'], lookup);
  map.set('bg', entry(bg ?? 'bg-transparent', !bg));
  const image = s['background-image'] || 'none';
  if (image !== 'none') {
    const local = image.replace(/url\(["']?([^"')]+)["']?\)/g, (_, url) => `url(${ctx.assetUrl?.(url) ?? url})`);
    map.set('bg-image', entry(`bg-[${arbitrary(local)}]`, false));
    const bgSize = s['background-size'] || 'auto';
    map.set('bg-size', entry({ auto: 'bg-auto', cover: 'bg-cover', contain: 'bg-contain' }[bgSize] ?? `[background-size:${arbitrary(bgSize)}]`, bgSize === 'auto'));
    const bgPos = s['background-position'] || '0% 0%';
    const posCls = ['50% 50%', 'center', 'center center'].includes(bgPos) ? 'bg-center' : `[background-position:${arbitrary(bgPos)}]`;
    map.set('bg-position', entry(posCls, bgPos === '0% 0%'));
  } else {
    map.set('bg-image', entry('bg-none', true));
  }

  const shadow = s['box-shadow'] || 'none';
  const shadowToken = lookup.shadows.get(shadow);
  map.set('shadow', entry(shadow === 'none' ? 'shadow-none' : shadowToken ? `shadow-${shadowToken}` : `shadow-[${arbitrary(shadow)}]`, shadow === 'none'));

  const opacity = Number(s.opacity ?? 1);
  map.set('opacity', entry(opacity === 1 ? 'opacity-100' : `opacity-[${opacity}]`, opacity === 1));

  const overflow = s.overflow || 'visible';
  map.set('overflow', entry(OVERFLOW[overflow] ?? `[overflow:${arbitrary(overflow)}]`, overflow === 'visible'));

  const transform = s.transform || 'none';
  map.set('transform', entry(transform === 'none' ? 'transform-none' : `[transform:${arbitrary(transform)}]`, transform === 'none'));

  if (REPLACED.has(el.tag)) {
    const fit = s['object-fit'] || 'fill';
    map.set('object-fit', entry(OBJECT_FIT[fit] ?? 'object-fill', fit === 'fill'));
    const objPos = s['object-position'] || '50% 50%';
    map.set('object-position', entry(objPos === '50% 50%' ? 'object-center' : `[object-position:${arbitrary(objPos)}]`, objPos === '50% 50%'));
  }

  const cursor = s.cursor || 'auto';
  map.set('cursor', entry(cursor === 'pointer' ? 'cursor-pointer' : 'cursor-auto', cursor !== 'pointer'));

  const vertical = s['vertical-align'] || 'baseline';
  if (display.startsWith('inline') || display === 'table-cell') {
    map.set('vertical', entry(VERTICAL[vertical] ?? 'align-baseline', vertical === 'baseline'));
  }

  if (el.tag === 'ul' || el.tag === 'ol') {
    const list = s['list-style-type'] || 'none';
    map.set('list', entry(LIST[list] ?? `list-[${arbitrary(list)}]`, list === 'none'));
  }

  return map;
}

function radiusClass(value, lookup) {
  if (value === '0px') return 'rounded-none';
  const parts = value.split(/\s+/);
  if (parts.length === 1 || parts.every((p) => p === parts[0])) {
    if (parts[0].endsWith('%')) return parseFloat(parts[0]) >= 50 ? 'rounded-full' : `rounded-[${parts[0]}]`;
    const n = px(parts[0]);
    if (n === null) return `rounded-[${arbitrary(value)}]`;
    if (n >= 999) return 'rounded-full';
    const token = lookup.radii.get(Math.round(n * 10) / 10);
    return token ? `rounded-${token}` : `rounded-[${Math.round(n * 100) / 100}px]`;
  }
  return `rounded-[${arbitrary(value)}]`;
}

/**
 * Widths and heights are where a naive copy breaks responsiveness, so only
 * sizes that carry meaning are kept: media dimensions, positioned boxes,
 * decorative leaves, and caps on blocks narrower than their container.
 */
function addSizing(map, el, parent, { display, parentDisplay, position, ctx }) {
  const s = el.style ?? {};
  const { w, h } = el.rect ?? { w: 0, h: 0 };
  const width = [];
  const height = [];
  const replaced = REPLACED.has(el.tag);
  const positioned = position === 'absolute' || position === 'fixed';
  const leaf = !ctx.hasChildren && !el.text;

  const maxWidth = px(s['max-width']);
  const maxCls = maxWidth
    ? maxWidth === ctx.lookup.container
      ? 'max-w-site'
      : `max-w-[${Math.round(maxWidth)}px]`
    : null;

  if (replaced) {
    width.push(`w-[${w}px]`, 'max-w-full');
    const fit = s['object-fit'] || 'fill';
    height.push(fit !== 'fill' || el.tag === 'svg' || el.tag === 'iframe' ? `h-[${h}px]` : 'h-auto');
  } else if (positioned) {
    const spansX = s.left && s.left !== 'auto' && s.right && s.right !== 'auto';
    const spansY = s.top && s.top !== 'auto' && s.bottom && s.bottom !== 'auto';
    if (!spansX) width.push(`w-[${w}px]`);
    if (!spansY && (leaf || !el.text)) height.push(`h-[${h}px]`);
  } else if (!parent) {
    // The page root always spans the viewport.
  } else {
    const ps = parent?.style ?? {};
    const parentFlows = !isFlex(parentDisplay) && !isGrid(parentDisplay);
    const parentContent = parent
      ? parent.rect.w -
        (px(ps['padding-left']) ?? 0) - (px(ps['padding-right']) ?? 0) -
        (px((ps['border-left'] ?? '').split(' ')[0]) ?? 0) - (px((ps['border-right'] ?? '').split(' ')[0]) ?? 0)
      : Infinity;
    if (leaf && (display.startsWith('inline') || !parentFlows)) {
      width.push(`w-[${w}px]`);
    } else if (parentFlows && FLOW_DISPLAYS.has(display) && w < parentContent - 2 && !maxCls) {
      width.push(`max-w-[${w}px]`);
    }
    if (leaf && h > 0) height.push(`h-[${h}px]`);
  }

  if (maxCls && !width.some((c) => c.startsWith('max-w'))) width.push(maxCls);
  const minHeight = px(s['min-height']);
  if (minHeight && !replaced) height.push(`min-h-[${Math.round(minHeight)}px]`);

  map.set('width', entry(width.length ? width : 'w-auto max-w-none', width.length === 0));
  map.set('height', entry(height.length ? height : 'h-auto min-h-0', height.length === 0));
}

/**
 * Merges mobile and desktop class maps into one class list: mobile values as
 * the base, desktop differences under the lg: breakpoint.
 */
export function mergeResponsive(mobile, desktop) {
  const out = [];
  const split = (cls) => (cls ? cls.split(' ').filter(Boolean) : []);
  const atLg = (cls) => split(cls).map((c) => `lg:${c}`);

  if (!mobile) {
    for (const { cls, def } of desktop.values()) if (!def) out.push(...split(cls));
    out.push('max-lg:hidden');
    return out;
  }

  const keys = new Set([...mobile.keys(), ...desktop.keys()]);
  for (const key of keys) {
    const m = mobile.get(key);
    const d = desktop.get(key);
    if (!m) {
      if (d && !d.def) out.push(...atLg(d.cls));
      continue;
    }
    if (!d) {
      if (!m.def) out.push(...split(m.cls));
      continue;
    }
    if (m.cls === d.cls) {
      if (!(m.def && d.def)) out.push(...split(m.cls));
      continue;
    }
    if (!m.def) out.push(...split(m.cls));
    if (!m.def || !d.def) out.push(...atLg(d.cls));
  }
  return out;
}
