import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assetFileName, extensionFor } from '../src/assets.js';

test('uses the content type to pick an extension', () => {
  assert.equal(extensionFor('image/webp', 'https://x.com/a'), '.webp');
  assert.equal(extensionFor('font/woff2', 'https://x.com/f'), '.woff2');
  assert.equal(extensionFor('image/svg+xml', 'https://x.com/logo'), '.svg');
});

test('falls back to the URL path when the content type is unknown', () => {
  assert.equal(extensionFor('application/octet-stream', 'https://x.com/hero.JPG?v=2'), '.jpg');
  assert.equal(extensionFor('', 'https://x.com/no-extension'), '');
});

test('ignores suspicious or overlong extensions', () => {
  assert.equal(extensionFor('', 'https://x.com/file.verylongext'), '');
  assert.equal(extensionFor('', 'https://x.com/file.p$p'), '');
});

test('asset names are stable and differ per URL', () => {
  const a = assetFileName('https://x.com/a.png', 'image/png');
  assert.equal(a, assetFileName('https://x.com/a.png', 'image/png'));
  assert.notEqual(a, assetFileName('https://x.com/b.png', 'image/png'));
  assert.match(a, /^[0-9a-f]{16}\.png$/);
});
