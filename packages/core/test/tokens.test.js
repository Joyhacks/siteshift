import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeTokens, px } from '../src/tokens/analyze.js';
import { buildThemeCss } from '../src/tokens/theme.js';

let counter = 0;
function el(tag, { text, rect = {}, style = {}, path } = {}) {
  counter += 1;
  return {
    path: path ?? `body > ${tag}:nth-of-type(${counter})`,
    tag,
    text,
    rect: { x: 0, y: 0, w: 100, h: 20, ...rect },
    style,
  };
}

const INK = 'rgb(26, 26, 46)';
const pad = (v) => ({ 'padding-top': `${v}px`, 'padding-right': `${v}px`, 'padding-bottom': `${v}px`, 'padding-left': `${v}px` });
const body = (size) => ({ color: INK, 'font-family': 'Arial, sans-serif', 'font-size': `${size}px`, 'line-height': `${size * 1.5}px`, 'font-weight': '400' });

function sampleCapture() {
  const desktop = [
    el('body', { rect: { w: 1440, h: 3000 }, style: { 'background-color': 'rgb(250, 247, 242)', color: INK } }),
    el('h1', {
      path: 'body > section > h1',
      text: 'Build faster with real systems',
      rect: { w: 800, h: 80 },
      style: { color: INK, 'font-family': '"Playfair Display", Georgia, serif', 'font-size': '64px', 'line-height': '70.4px', 'font-weight': '700', 'letter-spacing': '-1px' },
    }),
    el('h2', { path: 'body > h2:nth-of-type(1)', text: 'Features', style: { color: INK, 'font-family': '"Playfair Display", Georgia, serif', 'font-size': '36px', 'line-height': '43.2px', 'font-weight': '700' } }),
    ...Array.from({ length: 6 }, (_, i) =>
      el('p', { path: `body > p:nth-of-type(${i + 1})`, text: 'We build the systems that keep your business running every day.', style: { ...body(16), ...pad(0), 'margin-bottom': '16px' } }),
    ),
    ...Array.from({ length: 3 }, () => el('span', { text: 'Updated weekly', style: { ...body(14), color: 'rgb(107, 114, 128)' } })),
    el('button', {
      text: 'Get started',
      rect: { w: 160, h: 48 },
      style: { ...body(16), color: 'rgb(255, 255, 255)', 'background-color': 'rgb(79, 70, 229)', 'border-radius': '8px', 'padding-top': '12px', 'padding-bottom': '12px', 'padding-left': '24px', 'padding-right': '24px' },
    }),
    el('a', { text: 'Learn more', style: { ...body(16), color: 'rgb(79, 70, 229)' } }),
    ...Array.from({ length: 3 }, () =>
      el('div', {
        rect: { w: 380, h: 240 },
        style: { 'background-color': 'rgb(255, 255, 255)', 'border-radius': '12px', 'box-shadow': 'rgba(0, 0, 0, 0.08) 0px 4px 16px 0px', ...pad(24), 'border-top': '1px solid rgb(229, 231, 235)' },
      }),
    ),
    el('div', { rect: { x: 120, w: 1200, h: 2000 }, style: { 'max-width': '1200px', ...pad(32), gap: '32px' } }),
    el('footer', { rect: { w: 1440, h: 300 }, style: { 'background-color': 'rgb(17, 24, 39)', ...pad(64) } }),
    el('img', { rect: { w: 48, h: 48 }, style: { 'border-radius': '24px' } }),
  ];

  const mobile = [
    { path: 'body > section > h1', tag: 'h1', text: 'Build faster with real systems', rect: { x: 0, y: 0, w: 358, h: 90 }, style: { 'font-size': '36px' } },
    { path: 'body > h2:nth-of-type(1)', tag: 'h2', text: 'Features', rect: { x: 0, y: 0, w: 358, h: 40 }, style: { 'font-size': '28px' } },
  ];

  const manifest = { url: 'https://example.com/', viewports: { desktop: { viewport: { width: 1440, height: 900 } } } };
  return { manifest, desktop, mobile };
}

test('px reads only pixel lengths', () => {
  assert.equal(px('16px'), 16);
  assert.equal(px('-1.5px'), -1.5);
  assert.equal(px('normal'), null);
  assert.equal(px('90%'), null);
  assert.equal(px(undefined), null);
});

test('assigns color roles from how colors are used', () => {
  const { colors } = analyzeTokens(sampleCapture());
  assert.equal(colors.roles.background, '#faf7f2');
  assert.equal(colors.roles.foreground, '#1a1a2e');
  assert.equal(colors.roles.primary, '#4f46e5');
  assert.equal(colors.roles.primaryForeground, '#ffffff');
  assert.equal(colors.roles.muted, '#6b7280');
  assert.equal(colors.roles.surface, '#ffffff');
  assert.equal(colors.roles.inverse, '#111827');
  assert.equal(colors.roles.border, '#e5e7eb');
});

test('keeps the darkest neutral as body text even when muted text is more common', () => {
  const capture = sampleCapture();
  for (let i = 0; i < 20; i++) {
    capture.desktop.push(el('p', { text: 'A long muted paragraph that appears many times on the page.', style: { ...body(16), color: 'rgb(107, 114, 128)' } }));
  }
  const { colors } = analyzeTokens(capture);
  assert.equal(colors.roles.foreground, '#1a1a2e');
  assert.equal(colors.roles.muted, '#6b7280');
});

test('checks contrast of the main color pairs', () => {
  const { colors } = analyzeTokens(sampleCapture());
  const text = colors.contrast.find((c) => c.label === 'Body text on background');
  assert.ok(text.passesAA);
  assert.ok(text.ratio > 15);
});

test('merges near-identical colors into one palette entry', () => {
  const capture = sampleCapture();
  capture.desktop.push(el('p', { text: 'Almost the same ink color here', style: { ...body(16), color: 'rgb(27, 27, 47)' } }));
  const { colors } = analyzeTokens(capture);
  const ink = colors.palette.find((c) => c.hex === '#1a1a2e');
  assert.equal(ink.variants, 2);
  assert.equal(colors.palette.filter((c) => c.hex === '#1b1b2f').length, 0);
});

test('separates heading and body fonts', () => {
  const { fonts } = analyzeTokens(sampleCapture());
  assert.equal(fonts.heading.name, 'Playfair Display');
  assert.deepEqual(fonts.heading.weights, [700]);
  assert.equal(fonts.body.name, 'Arial');
});

test('builds a named, responsive type scale', () => {
  const { type } = analyzeTokens(sampleCapture());
  assert.equal(type.base, 16);
  const byName = Object.fromEntries(type.scale.map((s) => [s.name, s]));
  assert.equal(byName.base.size, 16);
  assert.equal(byName.base.lineHeight, 1.5);
  assert.equal(byName.sm.size, 14);
  assert.equal(byName.lg.size, 36);
  assert.equal(byName.lg.mobile, 28);
  assert.equal(byName.xl.size, 64);
  assert.equal(byName.xl.mobile, 36);
  assert.equal(byName.xl.letterSpacing, '-1px');
  assert.equal(byName.xl.weight, 700);
  assert.equal(byName.xl.fontFamily, '"Playfair Display", Georgia, serif');
  assert.equal(byName.base.fontFamily, 'Arial, sans-serif');
});

test('trims long samples at a word boundary', () => {
  const capture = sampleCapture();
  capture.desktop.push(el('h4', { text: 'A heading that is much longer than sixty characters and keeps on going', style: body(18) }));
  const { type } = analyzeTokens(capture);
  const step = type.scale.find((s) => s.size === 18);
  assert.equal(step.sample, 'A heading that is much longer than sixty characters and…');
});

test('keeps a one-off size that carries real text, drops stray labels', () => {
  const capture = sampleCapture();
  capture.desktop.push(el('p', { text: 'We design and build the software and automations that take repetitive work off your team.', style: body(20) }));
  capture.desktop.push(el('small', { text: '©', style: body(11) }));
  const { type } = analyzeTokens(capture);
  const sizes = type.scale.map((s) => s.size);
  assert.ok(sizes.includes(20));
  assert.ok(!sizes.includes(11));
});

test('prefers a large neutral surface over a small tinted one', () => {
  const capture = sampleCapture();
  capture.desktop.push(el('span', { text: 'New', rect: { w: 60, h: 24 }, style: { ...body(13), 'background-color': 'rgb(232, 237, 255)' } }));
  const { colors } = analyzeTokens(capture);
  assert.equal(colors.roles.surface, '#ffffff');
});

test('detects the spacing grid, radii, shadows and content width', () => {
  const tokens = analyzeTokens(sampleCapture());
  assert.equal(tokens.spacing.base, 8);
  assert.ok(tokens.spacing.scale.includes(24));
  assert.deepEqual(tokens.radii.values.map((r) => r.value), [8, 12]);
  assert.equal(tokens.radii.full, true);
  assert.equal(tokens.shadows.length, 1);
  assert.equal(tokens.container.width, 1200);
});

test('assumes a white background when the page has none', () => {
  const capture = sampleCapture();
  capture.desktop[0].style['background-color'] = 'rgba(0, 0, 0, 0)';
  const tokens = analyzeTokens(capture);
  assert.equal(tokens.colors.roles.background, '#ffffff');
  assert.equal(tokens.notes.length, 1);
});

test('rejects a capture without desktop styles', () => {
  assert.throws(() => analyzeTokens({ desktop: [] }), /no desktop styles/);
});

test('renders a Tailwind v4 theme with mobile type overrides', () => {
  const css = buildThemeCss(analyzeTokens(sampleCapture()));
  assert.match(css, /@theme \{/);
  assert.match(css, /--color-primary: #4f46e5;/);
  assert.match(css, /--font-heading: "Playfair Display", Georgia, serif;/);
  assert.match(css, /--text-xl: 4rem;/);
  assert.match(css, /--radius-md: 12px;/);
  assert.match(css, /--container-site: 75rem;/);
  assert.match(css, /@media \(max-width: 639px\) \{\n {2}:root \{\n {4}--text-lg: 1\.75rem;\n {4}--text-xl: 2\.25rem;/);
});
