# Siteshift

Move a website you own into clean, editable React + Tailwind code.

Siteshift opens your live site in a real browser, records exactly what it paints, and rebuilds it as a project you can edit, host anywhere and keep. It is built for the jobs website builders make painful: leaving Wix, Squarespace, Webflow or an old WordPress theme, recovering a site whose source code is gone, or giving a client a codebase they actually own.

> **Status: early.** Capture, design tokens and code generation work today. The automated verify loop and an AI pass that refines component structure are next. See the [roadmap](#roadmap).

## How it works

Most "clone a URL" tools hand raw HTML to an AI model and hope. Siteshift copies what the browser actually rendered, then checks its work against the original.

1. **Capture.** A headless browser loads the page like a visitor, scrolls it so lazy content loads, and records the result at desktop (1440px) and phone (390px) width: full-page screenshots, rendered HTML, the computed style of every visible element, and every image, font and stylesheet.
2. **Tokens.** The captured styles are reduced to a real design system. Colors get roles from how the page uses them: the backdrop text is actually read on (including gradients), the page frame when content sits on panels, text, muted, the call-to-action color, surface and border. Near-identical shades are merged, and the main pairs are checked against WCAG contrast. Fonts, a named type scale with its mobile sizes, the spacing grid, radii, shadows and content width come out the same way. Cookie banners and chat widgets are detected during capture and left out. Output is a Tailwind CSS v4 theme you can drop into a project.
3. **Generate.** The page becomes a runnable Vite + React + Tailwind CSS v4 project, one component per section. Each element's computed styles become Tailwind classes that reference the theme tokens where values match (`bg-primary`, `text-4xl`, `rounded-md`), with the mobile layout as the base and desktop differences under `lg:`. Text order, links, images, inline SVG icons and web fonts carry over. This step is deterministic, so it costs nothing to run.
4. **Verify.** The rebuild is rendered and screenshotted at the same widths, diffed against the original section by section, and repaired until it matches. Anything it cannot match is reported, never hidden.

## Quick start

Requires Node.js 20 or newer.

```bash
git clone https://github.com/Joyhacks/siteshift.git
cd siteshift
npm install
npm run setup:browser   # downloads Chromium for Playwright, once
npm run capture -- https://yoursite.com
npm run generate -- captures/yoursite.com
```

Capture output lands in `captures/<host>/<timestamp>/`:

```
desktop/   screenshot.png, page.html, styles.json   (1440px)
mobile/    screenshot.png, page.html, styles.json   (390px)
assets/    images, fonts, stylesheets and videos the page loaded
manifest.json   title, meta description, Open Graph tags, internal links, asset map
tokens.json     the design system as data
theme.css       the same tokens as a Tailwind CSS v4 @theme, with mobile type sizes
tokens.html     a visual preview: swatches, contrast, type scale, spacing, radii
```

Open the two screenshots. If they match the live site top to bottom, the capture is good. Then open `tokens.html` and check the colors and type against the live site.

A generated theme looks like this:

```css
@theme {
  --color-background: #fcfaf6;
  --color-foreground: #141a29;
  --color-primary: #555de3;
  --font-heading: "DejaVu Serif", Georgia, serif;
  --text-4xl: 4rem;
  --text-4xl--line-height: 1.1;
  --radius-md: 16px;
  --container-site: 75rem;
}

@media (max-width: 639px) {
  :root {
    --text-4xl: 2.5rem;
  }
}
```

Tailwind utilities read these variables at runtime, so `text-4xl` is 64px on desktop and 40px on phones with no extra classes.

`generate` writes the project to `captures/<host>/<timestamp>/site/`:

```
src/components/   one component per section: Header, HeroSection, Footer...
src/index.css     Tailwind import plus the theme
src/fonts.css     the site's @font-face rules, pointed at local files
public/assets/    images and fonts from the capture
```

Run it with `npm install` and `npm run dev`. Generated markup looks like this:

```tsx
<a className="text-primary-foreground font-semibold inline-block px-7 py-3.5 rounded-sm bg-primary" href="/contact">
  Start a project
</a>
```

On the project's test page, the rebuilt site matches the original's page height to the pixel at both widths, and every screenshot difference traces back to the cookie banner Siteshift deliberately leaves out.

## CLI

```
siteshift capture <url> [options]   capture a page, then extract its tokens
siteshift tokens <folder>           re-extract tokens from an existing capture
siteshift generate <folder>         build a React + Tailwind project from a capture

  -o, --out <dir>       capture: base folder (default: captures); generate: project folder
      --browser-path    Use an installed Chrome instead of Playwright's Chromium
      --allow-local     Allow localhost and private addresses (your own dev server)
      --skip-tokens     Capture only
  -h, --help            Show help
  -v, --version         Show the version
```

`siteshift tokens captures/yoursite.com` picks the newest capture for that site.

## Use it as a library

```js
import { captureSite, extractTokens, generateProject } from '@siteshift/core';

const { outDir } = await captureSite('https://yoursite.com', {
  outDir: 'captures',
  onProgress: ({ type, message }) => console.log(type, message),
});

const { tokens } = await extractTokens(outDir);
console.log(tokens.colors.roles.primary);

const project = await generateProject(outDir);
console.log(project.outDir, project.components);
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
- [x] Design tokens: color roles, contrast checks, fonts, responsive type scale, spacing grid, radii, shadows, content width
- [x] Tailwind CSS v4 theme output and visual preview
- [x] React + Tailwind code generation: section components, responsive classes, assets, fonts, inline SVG
- [ ] AI pass: repeated blocks into reusable components, cleaner names
- [ ] Visual verify loop with per-section match scores
- [ ] Interaction states: menus, tabs, accordions, sliders
- [ ] Multi-page sites with shared header and footer
- [ ] SEO carry-over: meta tags, redirects map, sitemap
- [ ] Web app, bring your own API key
- [ ] Telegram bot

## Project structure

```
packages/core/          engine (@siteshift/core)
  src/capture.js        browser capture
  src/tokens/           color math, token analysis, theme and preview output
  src/generate/         style-to-Tailwind conversion, JSX, components, project writer
apps/cli/               siteshift command
```

The web app and Telegram bot will live in `apps/` and share the same engine.

## Contributing

Issues and pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) first.

## License

[MIT](LICENSE) © Adeola Ilori
