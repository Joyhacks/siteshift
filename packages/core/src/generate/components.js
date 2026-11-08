// Splits the page into section components with readable names.

const HEADINGS = ['h1', 'h2', 'h3'];
const MIN_SECTION_HEIGHT = 8;

function firstHeading(node) {
  const stack = [node];
  while (stack.length) {
    const current = stack.shift();
    if (HEADINGS.includes(current.el.tag) && current.el.text) return current.el.text;
    stack.push(...current.children);
  }
  return null;
}

function containsTag(node, tag) {
  if (node.el.tag === tag) return true;
  return node.children.some((child) => containsTag(child, tag));
}

export function pascalCase(text) {
  const words = text
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4);
  const name = words.map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase()).join('');
  return /^[A-Z]/.test(name) ? name : null;
}

const realChildren = (node) => node.children.filter((n) => (n.el.rect?.h ?? 0) >= MIN_SECTION_HEIGHT);

/** True when children sit one below another, like page sections, not side by side. */
function stacked(children) {
  for (let i = 1; i < children.length; i++) {
    const prev = children[i - 1].el.rect ?? { y: 0, h: 0 };
    const next = children[i].el.rect ?? { y: 0 };
    if (next.y < prev.y + prev.h * 0.5) return false;
  }
  return true;
}

/**
 * Finds the page's top-level sections. Descends through single-child
 * wrappers, then keeps opening <main> and any container that holds most of
 * the page, as long as its children are stacked vertically. Many sites wrap
 * every section in one big div, and that div is not a section itself.
 */
export function findSections(root) {
  const wrappers = [root];
  let container = root;
  while (container.children.length === 1 && container.children[0].children.length > 0) {
    container = container.children[0];
    wrappers.push(container);
  }

  const pageHeight = root.el.rect?.h ?? Math.max(1, ...container.children.map((n) => n.el.rect?.h ?? 0));
  let candidates = realChildren(container);
  for (let depth = 0; depth < 6; depth++) {
    let opened = false;
    const next = [];
    for (const node of candidates) {
      const kids = realChildren(node);
      const dominant = node.el.tag === 'main' || (node.el.rect?.h ?? 0) >= 0.5 * pageHeight;
      if (dominant && !['header', 'footer'].includes(node.el.tag) && kids.length >= 2 && stacked(kids)) {
        next.push(...kids);
        opened = true;
      } else {
        next.push(node);
      }
    }
    candidates = next;
    if (!opened) break;
  }
  return { wrappers, sections: candidates };
}

/** Assigns component names: Header, Footer, then the section's first heading, then Section N. */
export function nameSections(sections) {
  const used = new Set(['App']);
  const names = new Map();
  sections.forEach((node, i) => {
    let name = null;
    const isFirst = i === 0;
    const isLast = i === sections.length - 1;
    if (node.el.tag === 'header' || (isFirst && containsTag(node, 'nav'))) name = 'Header';
    else if (node.el.tag === 'footer' || (isLast && containsTag(node, 'footer'))) name = 'Footer';
    else {
      const heading = firstHeading(node);
      name = heading ? pascalCase(heading) : null;
      if (name && !name.endsWith('Section')) name = `${name}Section`;
    }
    if (!name) name = `Section${i + 1}`;
    let unique = name;
    for (let n = 2; used.has(unique); n++) unique = `${name}${n}`;
    used.add(unique);
    names.set(node, unique);
  });
  return names;
}
