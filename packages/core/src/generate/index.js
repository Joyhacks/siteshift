import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { extractTokens, resolveCaptureDir } from '../tokens/index.js';
import { buildThemeCss } from '../tokens/theme.js';
import { parseColor, toHex } from '../tokens/color.js';
import { findSections, nameSections } from './components.js';
import { collectFontFaces } from './fonts.js';
import { buildTree, renderNode } from './jsx.js';
import {
  appFile,
  componentFile,
  indexCss,
  indexHtml,
  MAIN_TSX,
  packageJson,
  readme,
  TSCONFIG,
  VITE_CONFIG,
} from './project.js';
import { createTokenLookup } from './tailwind.js';

const MAX_THIRD_PARTY_SHARE = 0.25;

async function exists(file) {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));

function dropThirdParty(elements) {
  const flagged = elements.filter((el) => el.thirdParty).length;
  return flagged && flagged <= MAX_THIRD_PARTY_SHARE * elements.length
    ? elements.filter((el) => !el.thirdParty)
    : elements;
}

function slug(text) {
  return (text || 'site').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'site';
}

/**
 * Turns a capture into a runnable Vite + React + Tailwind CSS v4 project.
 * @param {string} dir capture folder, or a host folder (newest capture is used)
 * @param {{ outDir?: string }} [options] defaults to <capture>/site
 */
export async function generateProject(dir, options = {}) {
  const captureDir = await resolveCaptureDir(dir);
  const manifest = await readJson(path.join(captureDir, 'manifest.json'));
  const desktop = dropThirdParty(await readJson(path.join(captureDir, 'desktop', 'styles.json')));
  const mobileFile = path.join(captureDir, 'mobile', 'styles.json');
  const mobile = (await exists(mobileFile)) ? dropThirdParty(await readJson(mobileFile)) : [];

  const tokensFile = path.join(captureDir, 'tokens.json');
  const tokens = (await exists(tokensFile)) ? await readJson(tokensFile) : (await extractTokens(captureDir)).tokens;
  const lookup = createTokenLookup(tokens);
  const notes = [];

  if (!desktop.some((el) => el.content !== undefined || el.svg !== undefined)) {
    notes.push('This capture was made before Siteshift recorded text order and SVG markup. Re-capture the site for a more faithful rebuild.');
  }

  const sourceUrl = manifest.url;
  const origin = new URL(sourceUrl).origin;
  const assetFiles = manifest.assets?.files ?? {};
  const assetUrl = (url) => {
    try {
      const absolute = new URL(url, sourceUrl).href;
      const asset = assetFiles[absolute] ?? assetFiles[url];
      return asset ? `/${asset.file}` : absolute;
    } catch {
      return url;
    }
  };
  const linkUrl = (href) => {
    try {
      const url = new URL(href, sourceUrl);
      if (url.protocol === 'javascript:') return '#';
      if (url.origin === origin) return `${url.pathname}${url.search}${url.hash}` || '/';
      return url.href;
    } catch {
      return '#';
    }
  };

  const { root, byPath } = buildTree(desktop);
  const mobileByPath = new Map(mobile.map((el) => [el.path, el]));
  const mobileParentOf = (elPath) => {
    let current = elPath;
    while (current.includes(' > ')) {
      current = current.slice(0, current.lastIndexOf(' > '));
      const parent = mobileByPath.get(current);
      if (parent) return parent;
    }
    return null;
  };

  const mobileOnly = mobile.filter((el) => !byPath.has(el.path)).length;
  if (mobileOnly) notes.push(`${mobileOnly} elements appear only in the mobile layout (often a mobile menu) and are not rebuilt yet.`);

  const { sections } = findSections(root);
  const names = nameSections(sections);
  const baseCtx = { mobileByPath, mobileParentOf, lookup, assetUrl, linkUrl };

  const components = sections.map((node) => ({
    name: names.get(node),
    source: componentFile(names.get(node), renderNode(node, { ...baseCtx, componentFor: () => null })),
  }));
  const appJsx = renderNode(root, { ...baseCtx, componentFor: (node) => names.get(node) ?? null });

  // Fonts from the captured stylesheets
  const families = new Set(
    desktop.map((el) => el.style?.['font-family']?.split(',')[0]?.trim().replace(/^["']|["']$/g, '')).filter(Boolean),
  );
  const stylesheets = [];
  for (const [url, asset] of Object.entries(assetFiles)) {
    if (asset.kind !== 'stylesheet') continue;
    try {
      stylesheets.push({ url, css: await readFile(path.join(captureDir, asset.file), 'utf8') });
    } catch {
      // A stylesheet that failed to save simply contributes no fonts.
    }
  }
  const fontFaces = collectFontFaces(stylesheets, families, assetUrl);

  const body = desktop.find((el) => el.tag === 'body');
  const bodyBg = body ? parseColor(body.style?.['background-color']) : null;
  const pageBackground = bodyBg && bodyBg.alpha > 0.95 ? toHex(bodyBg) : null;

  const themePath = path.join(captureDir, 'theme.css');
  const themeCss = (await exists(themePath)) ? await readFile(themePath, 'utf8') : buildThemeCss(tokens);

  // Write the project
  const outDir = path.resolve(options.outDir ?? path.join(captureDir, 'site'));
  await mkdir(path.join(outDir, 'src', 'components'), { recursive: true });
  await mkdir(path.join(outDir, 'public', 'assets'), { recursive: true });

  const host = new URL(sourceUrl).hostname;
  const files = {
    'package.json': packageJson(slug(host)),
    'vite.config.ts': VITE_CONFIG,
    'tsconfig.json': TSCONFIG,
    'index.html': indexHtml(manifest.page),
    '.gitignore': 'node_modules\ndist\n',
    'src/main.tsx': MAIN_TSX,
    'src/App.tsx': appFile({ imports: components.map((c) => c.name), jsx: appJsx }),
    'src/index.css': indexCss({ themeCss, hasFonts: fontFaces.length > 0, pageBackground }),
    'README.md': readme({ source: sourceUrl, components: components.map((c) => c.name), notes }),
  };
  if (fontFaces.length) files['src/fonts.css'] = `${fontFaces.join('\n\n')}\n`;
  for (const c of components) files[`src/components/${c.name}.tsx`] = c.source;

  await Promise.all(Object.entries(files).map(([name, content]) => writeFile(path.join(outDir, name), content)));

  let copied = 0;
  for (const asset of Object.values(assetFiles)) {
    if (asset.kind === 'stylesheet') continue;
    try {
      await copyFile(path.join(captureDir, asset.file), path.join(outDir, 'public', asset.file));
      copied += 1;
    } catch {
      notes.push(`Could not copy ${asset.file}.`);
    }
  }

  return {
    captureDir,
    outDir,
    components: components.map((c) => c.name),
    fonts: fontFaces.length,
    assets: copied,
    notes,
  };
}
