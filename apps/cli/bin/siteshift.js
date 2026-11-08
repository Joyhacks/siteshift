#!/usr/bin/env node
import { createRequire } from 'node:module';
import { parseArgs } from 'node:util';
import { captureSite, TargetError } from '@siteshift/core';

const require = createRequire(import.meta.url);
const { version } = require('../package.json');

const HELP = `siteshift ${version}
Move a website you own into clean, editable code.

Usage
  siteshift capture <url> [options]

Commands
  capture <url>         Record the page as the browser paints it, at desktop
                        and mobile width: screenshots, rendered HTML, computed
                        styles, assets and page metadata.

Options
  -o, --out <dir>       Base folder for captures (default: captures)
      --browser-path    Use an installed Chrome instead of Playwright's Chromium
      --allow-local     Allow localhost and private network addresses, for
                        capturing your own dev server
  -h, --help            Show this help
  -v, --version         Show the version

Example
  siteshift capture https://yoursite.com
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
        help: { type: 'boolean', short: 'h', default: false },
        version: { type: 'boolean', short: 'v', default: false },
      },
    });
  } catch (err) {
    throw new UsageError(err.message);
  }
}

function printSummary(outDir, manifest) {
  const { page, viewports, assets, warnings } = manifest;
  console.log('\nDone.');
  console.log(`  Folder:   ${outDir}`);
  console.log(`  Title:    ${page?.title || '(none)'}`);
  for (const [name, viewport] of Object.entries(viewports)) {
    console.log(`  ${name.padEnd(8)}: ${viewport.elements} elements, ${viewport.pageHeight}px tall`);
  }
  console.log(`  Assets:   ${Object.keys(assets.files).length} saved, ${assets.skipped.length} skipped`);
  console.log(`  Links:    ${page?.internalLinks.length ?? 0} internal pages found`);
  if (warnings.length) console.log(`  Warnings: ${warnings.length} (see manifest.json)`);
}

async function main(argv) {
  const { values, positionals } = parse(argv);

  if (values.version) {
    console.log(version);
    return;
  }

  const [command, url] = positionals;
  if (values.help || !command) {
    console.log(HELP);
    return;
  }
  if (command !== 'capture') {
    throw new UsageError(`Unknown command "${command}". Run siteshift --help.`);
  }
  if (!url) {
    throw new UsageError('Give me a URL. Example: siteshift capture https://yoursite.com');
  }

  console.log(`Capturing ${url}`);
  const { outDir, manifest } = await captureSite(url, {
    outDir: values.out,
    executablePath: values['browser-path'],
    allowPrivateNetwork: values['allow-local'],
    onProgress: ({ type, message }) => {
      console.log(type === 'warning' ? `  warning: ${message}` : `  ${message}...`);
    },
  });
  printSummary(outDir, manifest);
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
  console.error(`\nCapture failed: ${err.message}`);
  process.exit(1);
});
