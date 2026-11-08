import { writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { ASSET_KINDS, EXT_BY_TYPE, LIMITS } from './constants.js';

/** Picks a file extension from the content type, falling back to the URL path. */
export function extensionFor(contentType, url) {
  if (EXT_BY_TYPE[contentType]) return EXT_BY_TYPE[contentType];
  let ext = '';
  try {
    ext = path.extname(new URL(url).pathname).toLowerCase();
  } catch {
    return '';
  }
  return /^\.[a-z0-9]{1,5}$/.test(ext) ? ext : '';
}

/** Stable, collision-resistant file name for an asset URL. */
export function assetFileName(url, contentType) {
  return createHash('sha1').update(url).digest('hex').slice(0, 16) + extensionFor(contentType, url);
}

/**
 * Saves images, fonts, stylesheets and videos as the page loads them.
 * Each URL is saved once across all viewports, within the size limits.
 */
export function createAssetCollector(assetsDir, limits = LIMITS) {
  const saved = new Map();
  const skipped = [];
  const pending = [];
  let totalBytes = 0;

  async function save(response) {
    const kind = response.request().resourceType();
    const url = response.url();

    if (!ASSET_KINDS.has(kind) || url.startsWith('data:') || saved.has(url)) return;
    const status = response.status();
    if (status < 200 || status >= 300) return;
    if (saved.size >= limits.maxAssets) {
      skipped.push({ url, reason: `asset count limit (${limits.maxAssets})` });
      return;
    }

    saved.set(url, null); // reserve the URL so a duplicate response is ignored

    let body;
    try {
      body = await response.body();
    } catch {
      saved.delete(url);
      return;
    }

    if (body.length > limits.maxAssetBytes) {
      saved.delete(url);
      skipped.push({ url, reason: 'file over the per-asset size limit' });
      return;
    }
    if (totalBytes + body.length > limits.maxTotalBytes) {
      saved.delete(url);
      skipped.push({ url, reason: 'total asset size limit reached' });
      return;
    }

    const contentType = (response.headers()['content-type'] || '').split(';')[0].trim();
    const name = assetFileName(url, contentType);
    totalBytes += body.length;
    saved.set(url, { file: `assets/${name}`, kind, contentType, bytes: body.length });
    await writeFile(path.join(assetsDir, name), body);
  }

  return {
    track(response) {
      pending.push(save(response).catch(() => {}));
    },
    async flush() {
      await Promise.allSettled(pending.splice(0));
    },
    summary() {
      return {
        files: Object.fromEntries([...saved].filter(([, entry]) => entry)),
        skipped: [...skipped],
        totalBytes,
      };
    },
  };
}
