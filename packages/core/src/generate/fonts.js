// Recovers @font-face rules from the captured stylesheets and points their
// sources at the downloaded font files.

const FACE = /@font-face\s*\{[^}]*\}/g;

function familyOf(rule) {
  const match = rule.match(/font-family\s*:\s*([^;]+);?/i);
  return match ? match[1].trim().replace(/^["']|["']$/g, '') : null;
}

/**
 * @param {{ url: string, css: string }[]} stylesheets captured CSS with its original URL
 * @param {Set<string>} families font family names the page uses
 * @param {(url: string) => string} assetUrl maps an original URL to a local path when downloaded
 */
export function collectFontFaces(stylesheets, families, assetUrl) {
  const seen = new Set();
  const faces = [];
  for (const { url, css } of stylesheets) {
    for (const rule of css.match(FACE) ?? []) {
      const family = familyOf(rule);
      if (!family || !families.has(family)) continue;
      const rewritten = rule.replace(/url\(\s*["']?([^"')]+)["']?\s*\)/g, (_, src) => {
        if (src.startsWith('data:')) return `url("${src}")`;
        let absolute;
        try {
          absolute = new URL(src, url).href;
        } catch {
          return `url("${src}")`;
        }
        return `url("${assetUrl(absolute)}")`;
      });
      const key = rewritten.replace(/\s+/g, ' ');
      if (seen.has(key)) continue;
      seen.add(key);
      faces.push(rewritten);
    }
  }
  return faces;
}
