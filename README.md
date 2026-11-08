# Siteshift

Move a website you own into clean, editable React + Tailwind code.

Siteshift opens your live site in a real browser, records exactly what it paints, and rebuilds it as a project you can edit, host anywhere and keep. It is built for the jobs website builders make painful: leaving Wix, Squarespace, Webflow or an old WordPress theme, recovering a site whose source code is gone, or giving a client a codebase they actually own.

> **Status: early.** The capture engine works today. Design tokens, code generation and the visual verify loop are next. See the [roadmap](#roadmap).

## How it works

Most "clone a URL" tools hand raw HTML to an AI model and hope. Siteshift copies what the browser actually rendered, then checks its work against the original.

1. **Capture.** A headless browser loads the page like a visitor, scrolls it so lazy content loads, and records the result at desktop (1440px) and phone (390px) width: full-page screenshots, rendered HTML, the computed style of every visible element, and every image, font and stylesheet.
2. **Tokens.** The captured styles are reduced to a real design system: the colors, type scale, spacing and radii the site uses.
3. **Convert.** The page becomes typed React components with Tailwind classes built from those tokens. AI is used only for structure and naming.
4. **Verify.** The rebuild is rendered and screenshotted at the same widths, diffed against the original section by section, and repaired until it matches. Anything it cannot match is reported, never hidden.

## Quick start

Requires Node.js 20 or newer.

```bash
git clone https://github.com/Joyhacks/siteshift.git
cd siteshift
npm install
npm run setup:browser   # downloads Chromium for Playwright, once
npm run capture -- https://yoursite.com
```

Output lands in `captures/<host>/<timestamp>/`:

```
desktop/   screenshot.png, page.html, styles.json   (1440px)
mobile/    screenshot.png, page.html, styles.json   (390px)
assets/    images, fonts, stylesheets and videos the page loaded
manifest.json   title, meta description, Open Graph tags, internal links, asset map
```

Open the two screenshots. If they match the live site top to bottom, the capture is good.

## CLI

```
siteshift capture <url> [options]

  -o, --out <dir>       Base folder for captures (default: captures)
      --browser-path    Use an installed Chrome instead of Playwright's Chromium
      --allow-local     Allow localhost and private addresses (your own dev server)
  -h, --help            Show help
  -v, --version         Show the version
```

## Use it as a library

```js
import { captureSite } from '@siteshift/core';

const { outDir, manifest } = await captureSite('https://yoursite.com', {
  outDir: 'captures',
  onProgress: ({ type, message }) => console.log(type, message),
});
```

## Limits

Siteshift keeps one page from taking over your machine. Per capture:

| Limit | Value |
|---|---|
| Single asset | 10 MB |
| All assets | 30 MB, 300 files |
| Page load | 60 seconds |
| Internal links recorded | 200 |

Pages built around heavy animation, canvas or WebGL, and sites behind bot protection, are the hardest cases. The capture reports what it could not load.

## Responsible use

Use Siteshift on websites you own or have the owner's written permission to copy. The tool reproduces text, images and design, and you are responsible for having the right to use them.

It must not be used for phishing, impersonation or passing off someone else's work as your own. Respect each site's terms of service.

Safeguards built in:

- Local and private network addresses are refused by default, so a hosted Siteshift server cannot be pointed at internal machines or cloud metadata endpoints. The CLI unlocks them only with `--allow-local`.
- URLs with embedded credentials are rejected.
- The hosted web app and Telegram bot will require proof of ownership (a meta tag or DNS record) before importing a site.

## Roadmap

- [x] Capture engine: screenshots, rendered DOM, computed styles, assets, metadata
- [x] CLI
- [ ] Design token extraction (colors, type scale, spacing, radii)
- [ ] React + Tailwind code generation
- [ ] Visual verify loop with per-section match scores
- [ ] Interaction states: menus, tabs, accordions, sliders
- [ ] Multi-page sites with shared header and footer
- [ ] SEO carry-over: meta tags, redirects map, sitemap
- [ ] Web app, bring your own API key
- [ ] Telegram bot

## Project structure

```
packages/core/   capture engine (@siteshift/core)
apps/cli/        siteshift command
```

The web app and Telegram bot will live in `apps/` and share the same engine.

## Contributing

Issues and pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) first.

## License

[MIT](LICENSE) © Adeola Ilori
