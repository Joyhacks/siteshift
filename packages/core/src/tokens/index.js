import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { analyzeTokens } from './analyze.js';
import { buildPreviewHtml } from './preview.js';
import { buildThemeCss } from './theme.js';

export { analyzeTokens } from './analyze.js';
export { buildThemeCss } from './theme.js';

async function exists(file) {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

/**
 * Accepts a capture folder, or a host folder like captures/example.com,
 * and returns the capture folder to use (the newest one for a host folder).
 */
export async function resolveCaptureDir(dir) {
  const target = path.resolve(dir);
  if (await exists(path.join(target, 'manifest.json'))) return target;

  let entries = [];
  try {
    entries = await readdir(target, { withFileTypes: true });
  } catch {
    throw new Error(`Folder not found: ${dir}`);
  }
  const runs = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort().reverse();
  for (const run of runs) {
    const candidate = path.join(target, run);
    if (await exists(path.join(candidate, 'manifest.json'))) return candidate;
  }
  throw new Error(`No capture found in ${dir}. Point at a folder made by "siteshift capture".`);
}

/**
 * Reads a capture and writes tokens.json, theme.css and tokens.html beside it.
 * @param {string} dir Capture folder, or a host folder (newest capture is used).
 */
export async function extractTokens(dir) {
  const captureDir = await resolveCaptureDir(dir);
  const manifest = await readJson(path.join(captureDir, 'manifest.json'));
  const desktop = await readJson(path.join(captureDir, 'desktop', 'styles.json'));
  const mobileFile = path.join(captureDir, 'mobile', 'styles.json');
  const mobile = (await exists(mobileFile)) ? await readJson(mobileFile) : [];

  const tokens = analyzeTokens({ manifest, desktop, mobile });
  const files = {
    json: path.join(captureDir, 'tokens.json'),
    css: path.join(captureDir, 'theme.css'),
    html: path.join(captureDir, 'tokens.html'),
  };

  await Promise.all([
    writeFile(files.json, JSON.stringify(tokens, null, 2)),
    writeFile(files.css, buildThemeCss(tokens)),
    writeFile(files.html, buildPreviewHtml(tokens)),
  ]);

  return { captureDir, tokens, files };
}
