import { test } from 'node:test';
import assert from 'node:assert/strict';
import { arbitrary, colorClass, createTokenLookup, sides, spacing } from '../src/generate/tailwind.js';
import { classMap, mergeResponsive } from '../src/generate/styles.js';
import { buildTree, escapeText, renderNode, svgToJsx } from '../src/generate/jsx.js';
import { findSections, nameSections, pascalCase } from '../src/generate/components.js';
import { collectFontFaces } from '../src/generate/fonts.js';

const tokens = {
  colors: {
    roles: {
      canvas: null, background: '#fcfaf6', surface: '#ffffff', inverse: '#0f1624', foreground: '#141a29',
      muted: '#636975', primary: '#555de3', primaryForeground: '#ffffff', border: '#e0e1e5',
    },
    palette: [{ hex: '#fcfaf6' }, { hex: '#caced4' }],
  },
  type: { scale: [{ name: 'base', size: 16 }, { name: '4xl', size: 64 }] },
  radii: { values: [{ name: 'sm', value: 8 }] },
  shadows: [],
  fonts: { heading: { stack: 'Georgia, serif' }, body: { stack: 'Arial, sans-serif' } },
  container: { width: 1200 },
};
const lookup = createTokenLookup(tokens);
const classes = (map) => [...map.values()].filter((e) => !e.def).map((e) => e.cls).join(' ');

test('spacing uses the 4px scale with half steps, exact pixels otherwise', () => {
  assert.equal(spacing('p', 16), 'p-4');
  assert.equal(spacing('p', 10), 'p-2.5');
  assert.equal(spacing('p', 13), 'p-[13px]');
  assert.equal(spacing('m', -8), '-m-2');
  assert.equal(spacing('p', 0), null);
});

test('four sides collapse to the shortest form', () => {
  assert.deepEqual(sides('p', [16, 16, 16, 16]), ['p-4']);
  assert.deepEqual(sides('p', [8, 24, 8, 24]), ['px-6', 'py-2']);
  assert.deepEqual(sides('p', [0, 0, 32, 0]), ['pb-8']);
});

test('arbitrary values replace spaces and escape underscores', () => {
  assert.equal(arbitrary('0 1px 2px rgba(0, 0, 0, 0.1)'), '0_1px_2px_rgba(0,0,0,0.1)');
  assert.equal(arbitrary('my_font'), 'my\\_font');
});

test('colors map to the role that fits their use', () => {
  assert.equal(colorClass('bg', 'rgb(85, 93, 227)', lookup), 'bg-primary');
  assert.equal(colorClass('text', 'rgb(255, 255, 255)', lookup), 'text-primary-foreground');
  assert.equal(colorClass('bg', 'rgb(255, 255, 255)', lookup), 'bg-surface');
  assert.equal(colorClass('text', 'rgb(1, 2, 3)', lookup), 'text-[#010203]');
  assert.equal(colorClass('bg', 'rgba(0, 0, 0, 0.5)', lookup), 'bg-[rgba(0,0,0,0.5)]');
  assert.equal(colorClass('bg', 'rgba(0, 0, 0, 0)', lookup), null);
});

const parent = { tag: 'div', rect: { x: 0, y: 0, w: 1200, h: 800 }, style: { display: 'block', color: 'rgb(20, 26, 41)', 'font-size': '16px', 'font-family': 'Arial, sans-serif' } };

test('emits only what differs from the parent and the preflight baseline', () => {
  const el = {
    tag: 'h1', text: 'Hello', rect: { x: 0, y: 0, w: 1200, h: 70 },
    style: { display: 'block', color: 'rgb(20, 26, 41)', 'font-size': '64px', 'line-height': '70.4px', 'font-family': 'Georgia, serif', 'font-weight': '700', 'margin-bottom': '16px' },
  };
  const cls = classes(classMap(el, parent, { lookup, useTokens: true, hasChildren: false }));
  assert.match(cls, /text-4xl/);
  assert.match(cls, /leading-\[70\.4px\]/);
  assert.match(cls, /font-heading/);
  assert.match(cls, /font-bold/);
  assert.match(cls, /mb-4/);
  assert.doesNotMatch(cls, /text-foreground/); // inherited, not repeated
  assert.doesNotMatch(cls, /\bblock\b/); // h1 is block by default
});

test('flex containers and items keep their layout', () => {
  const flex = { tag: 'div', rect: { x: 0, y: 0, w: 1200, h: 80 }, style: { display: 'flex', 'justify-content': 'space-between', 'align-items': 'center', gap: '24px', 'flex-direction': 'row' } };
  const cls = classes(classMap(flex, parent, { lookup, useTokens: true, hasChildren: true }));
  assert.match(cls, /\bflex\b/);
  assert.match(cls, /justify-between/);
  assert.match(cls, /items-center/);
  assert.match(cls, /gap-6/);

  const item = { tag: 'div', rect: { x: 0, y: 0, w: 300, h: 80 }, style: { display: 'block', 'flex-grow': '1', 'flex-shrink': '1', 'flex-basis': '0%' } };
  const itemCls = classes(classMap(item, flex, { lookup, useTokens: true, hasChildren: true }));
  assert.match(itemCls, /\bgrow\b/);
  assert.match(itemCls, /basis-\[0%\]/);
  assert.doesNotMatch(itemCls, /max-w-/); // flex items are sized by the flex layout
});

test('centered narrow blocks become mx-auto with a width cap', () => {
  const el = { tag: 'div', rect: { x: 120, y: 0, w: 960, h: 400 }, style: { display: 'block', 'margin-left': '120px', 'margin-right': '120px', 'max-width': '1200px' } };
  const cls = classes(classMap(el, parent, { lookup, useTokens: true, hasChildren: true }));
  assert.match(cls, /mx-auto/);
  assert.match(cls, /max-w-site/);
});

test('equal grid tracks become grid-cols-N', () => {
  const el = { tag: 'div', rect: { x: 0, y: 0, w: 1200, h: 400 }, style: { display: 'grid', 'grid-template-columns': '384px 384px 384px', gap: '24px' } };
  assert.match(classes(classMap(el, parent, { lookup, useTokens: true, hasChildren: true })), /grid-cols-3/);
});

test('responsive merge: mobile is the base, desktop differences go under lg:', () => {
  const m = new Map([['display', { cls: 'block', def: true }], ['grid', { cls: 'grid-cols-1', def: false }], ['size', { cls: 'text-[24px]', def: false }]]);
  const d = new Map([['display', { cls: 'grid', def: false }], ['grid', { cls: 'grid-cols-3', def: false }], ['size', { cls: 'text-[24px]', def: false }]]);
  assert.deepEqual(mergeResponsive(m, d), ['lg:grid', 'grid-cols-1', 'lg:grid-cols-3', 'text-[24px]']);
});

test('responsive merge resets a mobile-only value on desktop', () => {
  const m = new Map([['dir', { cls: 'flex-col', def: false }]]);
  const d = new Map([['dir', { cls: 'flex-row', def: true }]]);
  assert.deepEqual(mergeResponsive(m, d), ['flex-col', 'lg:flex-row']);
});

test('elements missing from the mobile layout are hidden below lg', () => {
  const d = new Map([['display', { cls: 'flex', def: false }]]);
  assert.deepEqual(mergeResponsive(null, d), ['flex', 'max-lg:hidden']);
});

test('JSX text escaping keeps braces and markup characters literal', () => {
  assert.equal(escapeText('a < b & {c}'), "a &lt; b &amp; {'{'}c{'}'}");
});

test('inline SVG becomes valid JSX with generated classes', () => {
  const jsx = svgToJsx('<svg class="icon" width="24" stroke-width="2" style="color:red" xmlns:xlink="x"><!-- c --><use xlink:href="#a"/><path fill-rule="evenodd" d="M0 0"/></svg>', 'w-6 h-6');
  assert.match(jsx, /^<svg width="24" strokeWidth="2" xmlnsXlink="x" className="w-6 h-6">/);
  assert.match(jsx, /xlinkHref="#a"/);
  assert.match(jsx, /fillRule="evenodd"/);
  assert.doesNotMatch(jsx, /style=|<!--|class=/);
});

test('the tree follows CSS paths, attaching orphans to the nearest captured ancestor', () => {
  const { root } = buildTree([
    { path: 'body', tag: 'body', style: {} },
    { path: 'body > main', tag: 'main', style: {} },
    { path: 'body > main > div > p', tag: 'p', style: {} },
  ]);
  assert.equal(root.children[0].el.tag, 'main');
  assert.equal(root.children[0].children[0].el.tag, 'p');
});

test('mixed text renders inline in document order', () => {
  const rect = { x: 0, y: 0, w: 300, h: 20 };
  const elements = [
    { path: 'body', tag: 'body', rect: { x: 0, y: 0, w: 1440, h: 900 }, style: { display: 'block' } },
    { path: 'body > p', tag: 'p', rect, text: 'Save today', content: ['Save ', { child: 'body > p > strong' }, ' today', { br: true }, 'Now'], style: { display: 'block' } },
    { path: 'body > p > strong', tag: 'strong', rect, text: '40%', content: ['40%'], style: { display: 'inline', 'font-weight': '700' } },
  ];
  const { root } = buildTree(elements);
  const ctx = { mobileByPath: new Map(), mobileParentOf: () => null, lookup, assetUrl: (u) => u, linkUrl: (u) => u };
  const jsx = renderNode(root.children[0], ctx);
  assert.match(jsx, /<p className="max-w-\[300px\] max-lg:hidden">Save <strong className="font-bold max-lg:hidden">40%<\/strong> today<br \/>Now<\/p>/);
});

test('sections are named from headers, footers and their first heading', () => {
  const node = (tag, children = [], text) => ({ el: { tag, text, rect: { h: 200 } }, children });
  const root = node('body', [
    node('div', [
      node('header', [node('nav')]),
      node('section', [node('h2', [], 'What we build for you')]),
      node('section', [node('p', [], 'quote')]),
      node('footer'),
    ]),
  ]);
  const { sections } = findSections(root);
  assert.equal(sections.length, 4);
  assert.deepEqual([...nameSections(sections).values()], ['Header', 'WhatWeBuildForSection', 'Section3', 'Footer']);
  assert.equal(pascalCase('¿Qué hacemos?'), 'QueHacemos');
  assert.equal(pascalCase('2024 results'), null);
});

test('font faces are kept for used families and pointed at local files', () => {
  const css = `@font-face{font-family:"DM Sans";font-weight:400;src:url(../fonts/dm.woff2) format("woff2")}
@font-face{font-family:"Unused";src:url(u.woff2)}`;
  const faces = collectFontFaces(
    [{ url: 'https://x.com/css/site.css', css }],
    new Set(['DM Sans']),
    (url) => (url === 'https://x.com/fonts/dm.woff2' ? '/assets/abc.woff2' : url),
  );
  assert.equal(faces.length, 1);
  assert.match(faces[0], /url\("\/assets\/abc\.woff2"\)/);
});

test('opens a page-wide wrapper into its stacked sections', () => {
  let y = 0;
  const box = (tag, h, children = [], text) => {
    const node = { el: { tag, text, rect: { x: 0, y, w: 1440, h } }, children };
    return node;
  };
  const at = (node, top) => { node.el.rect.y = top; return node; };
  const sections = ['Trusted by teams', 'What we build', 'Case studies', 'Pricing'].map((title, i) =>
    at(box('section', 1000, [box('h2', 40, [], title)]), 600 + i * 1000));
  const wrapper = at(box('div', 4000, sections), 600);
  const root = box('body', 5000, [at(box('header', 600, [box('nav', 80)]), 0), wrapper, at(box('footer', 400), 4600)]);
  const found = findSections(root).sections;
  assert.deepEqual(found.map((n) => n.el.tag), ['header', 'section', 'section', 'section', 'section', 'footer']);
});

test('does not split side-by-side columns into sections', () => {
  const col = (x) => ({ el: { tag: 'div', rect: { x, y: 0, w: 700, h: 3000 } }, children: [] });
  const twoColumn = { el: { tag: 'div', rect: { x: 0, y: 0, w: 1440, h: 3000 } }, children: [col(0), col(720)] };
  const root = { el: { tag: 'body', rect: { y: 0, h: 3200 } }, children: [twoColumn, { el: { tag: 'footer', rect: { y: 3000, h: 200 } }, children: [] }] };
  assert.equal(findSections(root).sections[0], twoColumn);
});
