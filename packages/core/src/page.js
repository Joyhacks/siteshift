// Functions that run against a loaded Playwright page.

import { LIMITS, STYLE_PROPS, THIRD_PARTY_MARKERS } from './constants.js';

// Matches cookie banners and chat widgets by id or class, case-insensitively.
const THIRD_PARTY_SELECTOR = THIRD_PARTY_MARKERS
  .flatMap((marker) => [`[id*="${marker}" i]`, `[class*="${marker}" i]`])
  .join(', ');

/** Scrolls to the bottom in steps so lazy images and sections load, then waits for fonts. */
export async function autoScroll(page, limits = LIMITS) {
  await page.evaluate(async () => {
    const step = Math.max(200, Math.floor(window.innerHeight * 0.8));
    let lastY = -1;
    for (let i = 0; i < 200; i++) {
      window.scrollBy(0, step);
      await new Promise((resolve) => setTimeout(resolve, 250));
      if (window.scrollY === lastY) break;
      lastY = window.scrollY;
    }
    window.scrollTo(0, 0);
  });
  await page.waitForLoadState('networkidle', { timeout: limits.idleTimeoutMs }).catch(() => {});
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
}

/**
 * Records every visible element: a CSS path, its box, own text, media source,
 * link target, id and classes, and the final computed styles the browser
 * painted. Elements inside cookie banners and chat widgets are flagged so the
 * design analysis can ignore them.
 */
export async function extractStyles(page, limits = LIMITS) {
  return page.evaluate(
    ({ props, maxText, thirdPartySelector }) => {
      const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'LINK', 'META']);

      const pathOf = (el) => {
        const parts = [];
        while (el && el.nodeType === 1 && el !== document.documentElement) {
          const tag = el.tagName.toLowerCase();
          const parent = el.parentElement;
          const siblings = parent ? [...parent.children].filter((c) => c.tagName === el.tagName) : [];
          parts.unshift(siblings.length > 1 ? `${tag}:nth-of-type(${siblings.indexOf(el) + 1})` : tag);
          el = parent;
        }
        return parts.join(' > ');
      };

      const elements = [];
      for (const el of [document.body, ...document.body.querySelectorAll('*')]) {
        if (SKIP.has(el.tagName)) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        const computed = getComputedStyle(el);
        if (computed.display === 'none' || computed.visibility === 'hidden') continue;

        const style = {};
        for (const prop of props) style[prop] = computed.getPropertyValue(prop);

        const classes = (el.getAttribute('class') || '').trim().replace(/\s+/g, ' ').slice(0, 200);
        // Consent plugins often tag <body> or <html> itself (e.g. "cmplz-optin"),
        // so only containers below <body> can mark an element as third party.
        let thirdParty = false;
        for (let node = el; node && node !== document.body && node !== document.documentElement; node = node.parentElement) {
          if (node.matches(thirdPartySelector)) {
            thirdParty = true;
            break;
          }
        }
        const ownText = [...el.childNodes]
          .filter((node) => node.nodeType === Node.TEXT_NODE)
          .map((node) => node.textContent.trim())
          .filter(Boolean)
          .join(' ');

        elements.push({
          path: pathOf(el),
          tag: el.tagName.toLowerCase(),
          rect: {
            x: Math.round(rect.x),
            y: Math.round(rect.y + window.scrollY),
            w: Math.round(rect.width),
            h: Math.round(rect.height),
          },
          text: ownText ? ownText.slice(0, maxText) : undefined,
          src: el.currentSrc || el.getAttribute('src') || undefined,
          href: el.tagName === 'A' ? el.href : undefined,
          id: el.id || undefined,
          classes: classes || undefined,
          thirdParty: thirdParty || undefined,
          style,
        });
      }
      return elements;
    },
    { props: STYLE_PROPS, maxText: limits.maxTextPerElement, thirdPartySelector: THIRD_PARTY_SELECTOR },
  );
}

/** Reads page-level metadata, including what search engines see and the site's internal links. */
export async function extractMeta(page, limits = LIMITS) {
  return page.evaluate((maxLinks) => {
    const attr = (selector, name) => document.querySelector(selector)?.getAttribute(name) ?? null;
    const sameOrigin = (href) => {
      try {
        return new URL(href).origin === location.origin;
      } catch {
        return false;
      }
    };

    return {
      title: document.title,
      description: attr('meta[name="description"]', 'content'),
      lang: document.documentElement.lang || null,
      canonical: document.querySelector('link[rel="canonical"]')?.href ?? null,
      ogTitle: attr('meta[property="og:title"]', 'content'),
      ogDescription: attr('meta[property="og:description"]', 'content'),
      ogImage: attr('meta[property="og:image"]', 'content'),
      favicon: document.querySelector('link[rel~="icon"]')?.href ?? null,
      pageHeight: document.documentElement.scrollHeight,
      internalLinks: [
        ...new Set(
          [...document.querySelectorAll('a[href]')]
            .map((a) => a.href.split('#')[0])
            .filter(sameOrigin),
        ),
      ].slice(0, maxLinks),
    };
  }, limits.maxInternalLinks);
}
