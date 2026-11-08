import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contrastRatio, findColors, parseColor, toHex } from '../src/tokens/color.js';

const hex = (value) => toHex(parseColor(value));

test('parses legacy and modern rgb syntax', () => {
  assert.equal(hex('rgb(26, 26, 46)'), '#1a1a2e');
  assert.equal(parseColor('rgba(0, 0, 0, 0.5)').alpha, 0.5);
  assert.equal(parseColor('rgb(26 26 46 / 50%)').alpha, 0.5);
  assert.equal(parseColor('transparent').alpha, 0);
});

test('converts oklch and oklab to sRGB', () => {
  assert.equal(hex('oklch(1 0 0)'), '#ffffff');
  assert.equal(hex('oklch(0 0 0)'), '#000000');
  assert.equal(hex('oklch(0.628 0.2577 29.23)'), '#ff0000');
  assert.equal(hex('oklch(62.8% 0.2577 29.23deg)'), '#ff0000');
  assert.equal(hex('oklab(1 0 0)'), '#ffffff');
});

test('handles color() spaces and clamps out-of-gamut values', () => {
  assert.equal(hex('color(srgb 1 0 0)'), '#ff0000');
  assert.equal(hex('color(display-p3 1 0 0)'), '#ff0000');
  assert.equal(parseColor('color(rec2020 1 0 0)'), null);
});

test('returns null for values it cannot read', () => {
  assert.equal(parseColor(''), null);
  assert.equal(parseColor('red'), null);
  assert.equal(parseColor('rgb(1, 2)'), null);
});

test('finds colors inside shorthand values', () => {
  assert.deepEqual(findColors('1px solid rgb(229, 231, 235)'), ['rgb(229, 231, 235)']);
  assert.equal(findColors('rgba(0, 0, 0, 0.1) 0px 4px 12px 0px, oklch(0.5 0.1 200) 0px 1px 2px 0px').length, 2);
  assert.deepEqual(findColors('none'), []);
});

test('computes WCAG contrast ratios', () => {
  const white = parseColor('rgb(255, 255, 255)');
  const black = parseColor('rgb(0, 0, 0)');
  assert.equal(Math.round(contrastRatio(white, black)), 21);
  assert.equal(contrastRatio(white, white), 1);
  const ratio = contrastRatio(parseColor('rgb(118, 118, 118)'), white);
  assert.ok(ratio > 4.5 && ratio < 4.6, `got ${ratio}`);
});
