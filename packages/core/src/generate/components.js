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

/**
 * Finds the page's top-level sections: descend through single-child wrappers,
 * open up <main>, and treat each remaining child with real height as a section.
 */
export function findSections(root) {
  const wrappers = [root];
  let container = root;
  while (container.children.length === 1 && container.children[0].children.length > 0) {
    container = container.children[0];
    wrappers.push(container);
  }

  const candidates = [];
  for (const child of container.children) {
    if (child.el.tag === 'main' && child.children.length > 1) candidates.push(...child.children);
    else candidates.push(child);
  }
  return { wrappers, sections: candidates.filter((n) => (n.el.rect?.h ?? 0) >= MIN_SECTION_HEIGHT) };
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
