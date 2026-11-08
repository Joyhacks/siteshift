import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeTokens, composite, px } from '../src/tokens/analyze.js';
import { parseColor, toHex } from '../src/tokens/color.js';
import { buildThemeCss } from '../src/tokens/theme.js';

let counter = 0;
function el(tag, { text, rect = {}, style = {}, path, ...extra } = {}) {
  counter += 1;
  return {
    path: path ?? `body > ${tag}:nth-of-type(${counter})`,
    tag,
    text,
    rect: { x: 0, y: 0, w: 100, h: 20, ...rect },
    style,
    ...extra,
  };
}

const INK = 'rgb(26, 26, 46)';
const pad = (v) => ({ 'padding-top': `${v}px`, 'padding-right': `${v}px`, 'padding-bottom': `${v}px`, 'padding-left': `${v}px` });
const body = (size) => ({ color: INK, 'font-family': 'Arial, sans-serif', 'font-size': `${size}px`, 'line-height': `${size * 1.5}px`, 'font-weight': '400' });

function sampleCapture() {
  const desktop = [
    el('body', { path: 'body', rect: { w: 1440, h: 3000 }, style: { 'background-color': 'rgb(250, 247, 242)', color: INK } }),
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

// A dark site frame with content on light panels, like many agency and SaaS
// sites: the body is dark green, most text sits on a white panel or a light
// gradient, a large dark-green band is decorative, and mint is the CTA color.
function framedCapture() {
  const panel = { 'background-color': 'rgb(255, 255, 255)' };
  const gradient = { 'background-image': 'linear-gradient(135deg, rgb(214, 236, 230) 0%, rgb(196, 226, 240) 100%)' };
  const copy = (color) => ({ color, 'font-family': '"DM Sans", sans-serif', 'font-size': '16px', 'font-weight': '400' });
  const cta = { 'background-color': 'rgb(49, 240, 199)', color: 'rgb(5, 32, 25)', 'border-radius': '999px' };

  const desktop = [
    el('body', { path: 'body', rect: { w: 1440, h: 6000 }, style: { 'background-color': 'rgb(9, 28, 20)', color: 'rgb(68, 78, 80)' } }),
    el('nav', { path: 'body > nav', rect: { w: 1400, h: 80 } }),
    el('a', { path: 'body > nav > a:nth-of-type(1)', text: 'Services', style: copy('rgb(255, 255, 255)') }),
    el('a', { path: 'body > nav > a:nth-of-type(2)', text: 'Contact us', rect: { w: 130, h: 44 }, style: { ...copy('rgb(5, 32, 25)'), ...cta } }),
    el('section', { path: 'body > section:nth-of-type(1)', rect: { w: 1400, h: 900 }, style: gradient }),
    el('h1', { path: 'body > section:nth-of-type(1) > h1', text: 'Build compliant software that enterprises actually buy', style: { ...copy('rgb(0, 0, 0)'), 'font-size': '70px' } }),
    el('a', { path: 'body > section:nth-of-type(1) > a', text: 'Book a call', rect: { w: 150, h: 48 }, style: { ...copy('rgb(5, 32, 25)'), ...cta } }),
    el('section', { path: 'body > section:nth-of-type(2)', rect: { w: 1400, h: 2400 }, style: panel }),
    ...Array.from({ length: 8 }, (_, i) =>
      el('p', { path: `body > section:nth-of-type(2) > p:nth-of-type(${i + 1})`, text: 'We design and build production-grade software with compliance engineered into the architecture.', style: copy(i % 2 ? 'rgb(36, 36, 36)' : 'rgb(68, 78, 80)') }),
    ),
    el('a', { path: 'body > section:nth-of-type(2) > a', text: 'Work with us', rect: { w: 150, h: 48 }, style: { ...copy('rgb(5, 32, 25)'), ...cta } }),
    el('section', { path: 'body > section:nth-of-type(3)', rect: { w: 1440, h: 1600 }, style: { 'background-color': 'rgb(4, 34, 25)' } }),
    el('p', { path: 'body > section:nth-of-type(3) > p', text: 'Trusted by teams in healthcare and fintech.', style: copy('rgb(220, 230, 226)') }),
  ];
  return { manifest: { url: 'https://framed.example/' }, desktop, mobile: [] };
}

test('reads background and text from where text actually sits, not the body', () => {
  const { colors } = analyzeTokens(framedCapture());
  assert.equal(colors.roles.canvas, '#091c14');
  assert.equal(colors.roles.background, '#ffffff');
  assert.equal(colors.roles.foreground, '#242424');
  assert.equal(colors.roles.muted, '#444e50');
});

test('picks the call-to-action color as primary over large decorative sections', () => {
  const { colors } = analyzeTokens(framedCapture());
  assert.equal(colors.roles.primary, '#31f0c7');
  assert.equal(colors.roles.primaryForeground, '#052019');
  assert.ok(colors.contrast.find((c) => c.label === 'Text on primary').passesAA);
});

test('omits the canvas role when content sits directly on the body', () => {
  const { colors } = analyzeTokens(sampleCapture());
  assert.equal(colors.roles.canvas, null);
});

test('blends translucent colors over their backdrop', () => {
  const seen = composite(parseColor('rgba(255, 255, 255, 0.8)'), parseColor('rgb(4, 34, 25)'));
  assert.equal(toHex(seen), '#cdd3d1');
});

test('counts translucent text as the color a reader actually sees', () => {
  const dark = { 'background-color': 'rgb(4, 34, 25)' };
  const copy = (color, n, base) =>
    Array.from({ length: n }, (_, i) =>
      el('p', { path: `body > section > p.${base}:nth-of-type(${i + 1})`, text: 'Production-grade software with compliance engineered in from day one.', style: { color, 'font-size': '16px' } }),
    );
  const capture = {
    manifest: {},
    desktop: [
      el('body', { path: 'body', rect: { w: 1440, h: 4000 }, style: dark }),
      el('section', { path: 'body > section', rect: { w: 1440, h: 3000 }, style: dark }),
      ...copy('rgb(255, 255, 255)', 3, 'a'),
      ...copy('rgba(255, 255, 255, 0.8)', 6, 'b'),
      ...copy('rgba(234, 243, 239, 0.75)', 8, 'c'),
    ],
  };
  const { colors } = analyzeTokens(capture);
  assert.equal(colors.roles.background, '#042219');
  assert.equal(colors.roles.foreground, '#ffffff');
  assert.equal(colors.roles.muted, '#b1bfba');
  assert.ok(colors.palette.some((c) => c.hex === '#cdd3d1'));
});

test('ignores cookie banners and chat widgets', () => {
  const capture = sampleCapture();
  for (let i = 0; i < 12; i++) {
    capture.desktop.push(el('p', { thirdParty: true, text: 'We use essential cookies to make our website work. Accept all?', style: { ...body(18), color: 'rgb(200, 0, 120)' } }));
  }
  const tokens = analyzeTokens(capture);
  assert.ok(!tokens.type.scale.some((s) => s.size === 18));
  assert.ok(!tokens.colors.palette.some((c) => c.hex === '#c80078'));
  assert.match(tokens.notes.join(' '), /Ignored 12 elements/);
});

test('keeps display headings when the scale is capped', () => {
  const capture = sampleCapture();
  for (const size of [11, 12, 13, 15, 17, 18, 19, 20, 21, 22, 24, 26, 30]) {
    capture.desktop.push(...Array.from({ length: 3 }, () => el('p', { text: 'Plenty of supporting copy at this size to compete for a slot.', style: body(size) })));
  }
  capture.desktop.push(el('h1', { text: 'Hero', style: { ...body(70), 'font-weight': '700' } }));
  const { type } = analyzeTokens(capture);
  const sizes = type.scale.map((s) => s.size);
  assert.ok(sizes.length <= 12);
  assert.ok(sizes.includes(70), `scale was ${sizes.join(', ')}`);
  assert.ok(sizes.includes(16));
});

test('detects a 2px spacing grid', () => {
  const capture = { manifest: {}, desktop: [el('body', { path: 'body', rect: { w: 1440, h: 2000 } })] };
  for (const v of [10, 14, 18, 22, 26, 10, 14, 18, 22, 26, 12, 16]) capture.desktop.push(el('div', { style: pad(v) }));
  const tokens = analyzeTokens(capture);
  assert.equal(tokens.spacing.base, 2);
  assert.match(buildThemeCss(tokens), /2px grid\. Keep Tailwind's 4px unit/);
});
