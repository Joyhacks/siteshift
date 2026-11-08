// Element tree and JSX rendering.

import { classMap, mergeResponsive } from './styles.js';

const KEEP_TAGS = new Set([
  'header', 'footer', 'main', 'nav', 'section', 'article', 'aside', 'div', 'span', 'p', 'a', 'button',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'img', 'svg', 'video', 'figure', 'figcaption',
  'blockquote', 'strong', 'em', 'b', 'i', 'small', 'label', 'form', 'input', 'textarea', 'select', 'option',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'hr', 'code', 'pre', 'sup', 'sub', 'mark', 'time',
  'address', 'dl', 'dt', 'dd', 'iframe', 'canvas', 'abbr', 's', 'u', 'cite', 'q', 'details', 'summary',
]);
const VOID = new Set(['img', 'input', 'hr', 'br']);
const ATTR_NAMES = {
  'aria-label': 'aria-label', title: 'title', role: 'role', type: 'type', name: 'name', placeholder: 'placeholder',
  rel: 'rel', target: 'target', for: 'htmlFor', colspan: 'colSpan', rowspan: 'rowSpan',
};

/** Rebuilds the parent/child tree from CSS paths, preserving document order. */
export function buildTree(elements) {
  const byPath = new Map();
  const nodes = elements.map((el) => ({ el, children: [], parent: null }));
  for (const node of nodes) byPath.set(node.el.path, node);
  const root = byPath.get('body') ?? nodes[0];

  for (const node of nodes) {
    if (node === root) continue;
    let path = node.el.path;
    let parent = null;
    while (!parent) {
      const cut = path.lastIndexOf(' > ');
      if (cut < 0) break;
      path = path.slice(0, cut);
      parent = byPath.get(path) ?? null;
    }
    node.parent = parent ?? root;
    node.parent.children.push(node);
  }
  return { root, byPath };
}

export function escapeText(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/[{}]/g, (ch) => `{'${ch}'}`);
}

const escapeAttr = (value) => String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;');

const camel = (name) => name.replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());

/** Converts inline SVG markup to valid JSX and applies the element's classes. */
export function svgToJsx(markup, className) {
  let svg = markup
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\s(style|class)="[^"]*"/g, (match, attr, offset, whole) => (attr === 'class' ? match : ''))
    .replace(/\sxlink:href=/g, ' xlinkHref=')
    .replace(/\sxmlns:xlink=/g, ' xmlnsXlink=')
    .replace(/\sxml:space="[^"]*"/g, '')
    .replace(/\s([a-z]+(?:-[a-z]+)+)=/g, (match, name) => (/^(data|aria)-/.test(name) ? match : ` ${camel(name)}=`))
    .replace(/\sclass=/g, ' className=');
  // Replace or add the root className with the generated classes.
  svg = svg.replace(/^<svg\b([^>]*)>/, (open, attrs) => {
    const cleaned = attrs.replace(/\sclassName="[^"]*"/, '');
    return `<svg${cleaned}${className ? ` className="${className}"` : ''}>`;
  });
  return svg;
}

/**
 * Renders a node and its subtree as JSX.
 * ctx: { mobileByPath, mobileParentOf, lookup, assetUrl, linkUrl, componentFor }
 */
export function renderNode(node, ctx, depth = 0, inline = false) {
  const component = ctx.componentFor?.(node);
  const pad = inline ? '' : '  '.repeat(depth);
  if (component) return `${pad}<${component} />`;

  const el = node.el;
  const tag = el.tag === 'body' || el.tag === 'picture' || !KEEP_TAGS.has(el.tag) ? 'div' : el.tag;

  const desktopMap = classMap(el, node.parent?.el ?? null, {
    lookup: ctx.lookup,
    useTokens: true,
    hasChildren: node.children.length > 0,
    assetUrl: ctx.assetUrl,
  });
  const mobileEl = ctx.mobileByPath.get(el.path);
  const mobileMap = mobileEl
    ? classMap(mobileEl, ctx.mobileParentOf(el.path), {
        lookup: ctx.lookup,
        useTokens: false,
        hasChildren: node.children.length > 0,
        assetUrl: ctx.assetUrl,
      })
    : null;
  const className = mergeResponsive(mobileMap, desktopMap).join(' ').replace(/"/g, "'");

  if (el.tag === 'svg' && el.svg) {
    const svg = svgToJsx(el.svg, className);
    return inline ? svg.replace(/\s*\n\s*/g, ' ') : svg.split('\n').map((line) => pad + line.trim()).join('\n');
  }

  const attrs = [];
  if (className) attrs.push(`className="${className}"`);
  if (el.tag === 'a' && el.href) attrs.push(`href="${escapeAttr(ctx.linkUrl(el.href))}"`);
  if ((el.tag === 'img' || el.tag === 'video' || el.tag === 'iframe') && el.src) {
    attrs.push(`src="${escapeAttr(ctx.assetUrl(el.src))}"`);
  }
  if (el.tag === 'img') attrs.push(`alt="${escapeAttr(el.attrs?.alt ?? '')}"`);
  for (const [name, value] of Object.entries(el.attrs ?? {})) {
    if (ATTR_NAMES[name] && !(name === 'alt')) attrs.push(`${ATTR_NAMES[name]}="${escapeAttr(value)}"`);
  }
  if (el.tag === 'a' && el.attrs?.target === '_blank' && !el.attrs?.rel) attrs.push('rel="noopener noreferrer"');
  const open = attrs.length ? `<${tag} ${attrs.join(' ')}` : `<${tag}`;

  if (VOID.has(tag)) return `${pad}${open} />`;

  if (el.content) {
    const byPath = new Map(node.children.map((child) => [child.el.path, child]));
    const used = new Set();
    const parts = el.content.map((item) => {
      if (typeof item === 'string') return escapeText(item);
      if (item.br) return '<br />';
      const child = byPath.get(item.child);
      if (!child) return '';
      used.add(child);
      return renderNode(child, ctx, 0, true);
    });
    for (const child of node.children) if (!used.has(child)) parts.push(renderNode(child, ctx, 0, true));
    const body = parts.join('').replace(/^ +| +$/g, '');
    return `${pad}${open}>${body}</${tag}>`;
  }

  if (!node.children.length) return `${pad}${open} />`;

  if (inline) return `${open}>${node.children.map((child) => renderNode(child, ctx, 0, true)).join('')}</${tag}>`;
  const children = node.children.map((child) => renderNode(child, ctx, depth + 1)).join('\n');
  return `${pad}${open}>\n${children}\n${pad}</${tag}>`;
}
