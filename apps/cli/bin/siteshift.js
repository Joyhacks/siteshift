#!/usr/bin/env node
import { createRequire } from 'node:module';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { captureSite, extractTokens, TargetError } from '@siteshift/core';

const require = createRequire(import.meta.url);
const { version } = require('../package.json');

const HELP = `siteshift ${version}
Move a website you own into clean, editable code.

Usage
  siteshift capture <url> [options]
  siteshift tokens <folder>

Commands
  capture <url>         Record the page as the browser paints it, at desktop
                        and mobile width, then extract its design tokens.
  tokens <folder>       Extract design tokens from an existing capture. Accepts
                        a capture folder or a host folder such as
                        captures/example.com (the newest capture is used).

Options
  -o, --out <dir>       Base folder for captures (default: captures)
      --browser-path    Use an installed Chrome instead of Playwright's Chromium
      --allow-local     Allow localhost and private network addresses, for
                        capturing your own dev server
      --skip-tokens     Capture only, without extracting tokens
  -h, --help            Show this help
  -v, --version         Show the version

Examples
  siteshift capture https://yoursite.com
  siteshift tokens captures/yoursite.com
`;

class UsageError extends Error {}

function parse(argv) {
  try {
    return parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        out: { type: 'string', short: 'o', default: 'captures' },
        'browser-path': { type: 'string' },
        'allow-local': { type: 'boolean', default: false },
        'skip-tokens': { type: 'boolean', default: false },
        help: { type: 'boolean', short: 'h', default: false },
        version: { type: 'boolean', short: 'v', default: false },
      },
    });
  } catch (err) {
    throw new UsageError(err.message);
  }
}

function printCaptureSummary(outDir, manifest) {
  const { page, viewports, assets, warnings } = manifest;
  console.log('\nCaptured.');
  console.log(`  Folder:   ${outDir}`);
  console.log(`  Title:    ${page?.title || '(none)'}`);
  for (const [name, viewport] of Object.entries(viewports)) {
    console.log(`  ${name.padEnd(8)}: ${viewport.elements} elements, ${viewport.pageHeight}px tall`);
  }
  console.log(`  Assets:   ${Object.keys(assets.files).length} saved, ${assets.skipped.length} skipped`);
  console.log(`  Links:    ${page?.internalLinks.length ?? 0} internal pages found`);
  if (warnings.length) console.log(`  Warnings: ${warnings.length} (see manifest.json)`);
}

function printTokenSummary({ tokens, files }) {
  const { colors, fonts, type, spacing, radii, container } = tokens;
  const fontNames = [...new Set([fonts.heading?.name, fonts.body?.name].filter(Boolean))].join(' + ') || 'none';
  const failing = colors.contrast.filter((c) => !c.passesAA);

  console.log('\nTokens.');
  console.log(`  Colors:   ${colors.palette.length} (primary ${colors.roles.primary}, text ${colors.roles.foreground}, background ${colors.roles.background})`);
  console.log(`  Fonts:    ${fontNames}`);
  console.log(`  Type:     ${type.scale.length} sizes, base ${type.base ?? '?'}px`);
  console.log(`  Spacing:  ${spacing.base ? `${spacing.base}px grid (${spacing.consistency}% fit)` : 'no consistent grid'}`);
  console.log(`  Radii:    ${radii.values.map((r) => `${r.value}px`).join(', ') || 'none'}${radii.full ? ', full' : ''}`);
  console.log(`  Width:    ${container.width ? `${container.width}px` : 'not detected'}`);
  if (failing.length) console.log(`  Contrast: ${failing.length} pair(s) fail WCAG AA (see tokens.html)`);
  console.log(`  Preview:  ${files.html}`);
  console.log(`  Theme:    ${path.basename(files.css)}, ${path.basename(files.json)}`);
  for (const note of tokens.notes) console.log(`  note: ${note}`);
}

async function runCapture(url, values) {
  if (!url) throw new UsageError('Give me a URL. Example: siteshift capture https://yoursite.com');
  console.log(`Capturing ${url}`);
  const { outDir, manifest } = await captureSite(url, {
    outDir: values.out,
    executablePath: values['browser-path'],
    allowPrivateNetwork: values['allow-local'],
    onProgress: ({ type, message }) => {
      console.log(type === 'warning' ? `  warning: ${message}` : `  ${message}...`);
    },
  });
  printCaptureSummary(outDir, manifest);
  if (!values['skip-tokens']) printTokenSummary(await extractTokens(outDir));
}

async function runTokens(folder) {
  if (!folder) throw new UsageError('Give me a capture folder. Example: siteshift tokens captures/yoursite.com');
  printTokenSummary(await extractTokens(folder));
}

async function main(argv) {
  const { values, positionals } = parse(argv);
  if (values.version) {
    console.log(version);
    return;
  }

  const [command, target] = positionals;
  if (values.help || !command) {
    console.log(HELP);
    return;
  }

  if (command === 'capture') return runCapture(target, values);
  if (command === 'tokens') return runTokens(target);
  throw new UsageError(`Unknown command "${command}". Run siteshift --help.`);
}

main(process.argv.slice(2)).catch((err) => {
  if (err instanceof UsageError || err instanceof TargetError) {
    console.error(`\n${err.message}`);
    process.exit(2);
  }
  if (/Executable doesn't exist/i.test(err.message)) {
    console.error('\nChromium is not installed. Run: npx playwright install chromium');
    process.exit(1);
  }
  console.error(`\nFailed: ${err.message}`);
  process.exit(1);
});
