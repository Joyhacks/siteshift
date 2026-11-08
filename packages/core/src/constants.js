// Shared settings for the capture engine.

/** Widths the page is captured at. Desktop and phone, like a real visitor. */
export const VIEWPORTS = Object.freeze({
  desktop: Object.freeze({ width: 1440, height: 900 }),
  mobile: Object.freeze({ width: 390, height: 844 }),
});

/** Hard limits that keep one huge page from filling the disk. */
export const LIMITS = Object.freeze({
  maxAssetBytes: 10 * 1024 * 1024,
  maxTotalBytes: 30 * 1024 * 1024,
  maxAssets: 300,
  maxInternalLinks: 200,
  maxTextPerElement: 500,
  loadTimeoutMs: 60_000,
  idleTimeoutMs: 15_000,
});

/** Network resource types saved into the assets folder. */
export const ASSET_KINDS = new Set(['image', 'font', 'stylesheet', 'media']);

/** Computed CSS properties recorded for every visible element. */
export const STYLE_PROPS = Object.freeze([
  'display', 'position', 'top', 'right', 'bottom', 'left', 'z-index',
  'width', 'height', 'min-height', 'max-width',
  'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'flex-direction', 'flex-wrap', 'justify-content', 'align-items', 'gap',
  'grid-template-columns', 'grid-template-rows',
  'font-family', 'font-size', 'font-weight', 'font-style', 'line-height',
  'letter-spacing', 'text-align', 'text-transform', 'text-decoration-line',
  'color', 'background-color', 'background-image', 'background-size', 'background-position',
  'border-top', 'border-right', 'border-bottom', 'border-left', 'border-radius',
  'box-shadow', 'opacity', 'overflow', 'object-fit', 'transform', 'transition',
]);

/** File extensions by content type, for naming saved assets. */
export const EXT_BY_TYPE = Object.freeze({
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/svg+xml': '.svg',
  'image/avif': '.avif',
  'image/x-icon': '.ico',
  'image/vnd.microsoft.icon': '.ico',
  'font/woff2': '.woff2',
  'font/woff': '.woff',
  'font/ttf': '.ttf',
  'font/otf': '.otf',
  'application/font-woff2': '.woff2',
  'application/font-woff': '.woff',
  'text/css': '.css',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
});

/**
 * id or class fragments of cookie banners, consent managers and chat widgets.
 * Their text and colors are not part of the site's design.
 */
export const THIRD_PARTY_MARKERS = Object.freeze([
  'cookie', 'consent', 'gdpr', 'cmplz', 'onetrust', 'cookiebot', 'cookieyes', 'iubenda',
  'termly', 'usercentrics', 'didomi', 'osano', 'intercom', 'crisp-client', 'tawk',
  'drift-frame', 'hubspot-messages', 'livechat', 'zsiq', 'tidio', 'chatwoot',
]);
