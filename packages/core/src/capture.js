import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { createAssetCollector } from './assets.js';
import { LIMITS, VIEWPORTS } from './constants.js';
import { autoScroll, extractMeta, extractStyles } from './page.js';
import { validateTarget } from './url-safety.js';

const MANIFEST_VERSION = 1;

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function captureViewport({ browser, target, name, viewport, outDir, assets, limits, warn }) {
  const viewDir = path.join(outDir, name);
  await mkdir(viewDir, { recursive: true });

  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    colorScheme: 'light',
    isMobile: name === 'mobile',
    hasTouch: name === 'mobile',
  });
  const page = await context.newPage();
  page.on('response', (response) => assets.track(response));

  try {
    await page.goto(target.href, { waitUntil: 'load', timeout: limits.loadTimeoutMs });
    await page.waitForLoadState('networkidle', { timeout: limits.idleTimeoutMs }).catch(() => {
      warn(`${name}: the network never went fully quiet; captured what had loaded`);
    });
    await autoScroll(page, limits);

    await page.screenshot({ path: path.join(viewDir, 'screenshot.png'), fullPage: true });
    await writeFile(path.join(viewDir, 'page.html'), await page.content());

    const elements = await extractStyles(page, limits);
    await writeFile(path.join(viewDir, 'styles.json'), JSON.stringify(elements, null, 2));

    const meta = await extractMeta(page, limits);
    await assets.flush();

    return {
      result: { viewport: { ...viewport }, elements: elements.length, pageHeight: meta.pageHeight },
      meta,
    };
  } finally {
    await context.close();
  }
}

/**
 * Captures a live page exactly as the browser paints it, at each viewport.
 *
 * Writes <outDir>/<host>/<timestamp>/ with a screenshot, rendered HTML and
 * computed styles per viewport, every loaded asset, and manifest.json.
 *
 * @param {string} url Public page to capture.
 * @param {object} [options]
 * @param {string} [options.outDir='captures'] Base folder for captures.
 * @param {Record<string, {width: number, height: number}>} [options.viewports]
 * @param {boolean} [options.allowPrivateNetwork=false] Local CLI use only. Never enable on a hosted server.
 * @param {string} [options.executablePath] Use an installed Chrome instead of Playwright's Chromium.
 * @param {(event: {type: string, message: string}) => void} [options.onProgress]
 * @returns {Promise<{outDir: string, manifest: object}>}
 */
export async function captureSite(url, options = {}) {
  const {
    outDir: baseDir = 'captures',
    viewports = VIEWPORTS,
    allowPrivateNetwork = false,
    executablePath,
    onProgress = () => {},
    limits = LIMITS,
  } = options;

  const target = await validateTarget(url, { allowPrivateNetwork });
  const outDir = path.resolve(baseDir, target.hostname, timestamp());
  const assetsDir = path.join(outDir, 'assets');
  await mkdir(assetsDir, { recursive: true });

  const warnings = [];
  const warn = (message) => {
    warnings.push(message);
    onProgress({ type: 'warning', message });
  };

  const assets = createAssetCollector(assetsDir, limits);
  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  const results = {};
  let pageMeta = null;

  try {
    for (const [name, viewport] of Object.entries(viewports)) {
      onProgress({ type: 'viewport', message: `${name} (${viewport.width}px)` });
      const { result, meta } = await captureViewport({
        browser, target, name, viewport, outDir, assets, limits, warn,
      });
      results[name] = result;
      if (!pageMeta || name === 'desktop') pageMeta = meta;
    }
  } finally {
    await browser.close();
  }

  const manifest = {
    version: MANIFEST_VERSION,
    url: target.href,
    capturedAt: new Date().toISOString(),
    page: pageMeta,
    viewports: results,
    assets: assets.summary(),
    warnings,
  };
  await writeFile(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

  return { outDir, manifest };
}
