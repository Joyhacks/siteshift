import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPrivateIp, validateTarget, TargetError } from '../src/url-safety.js';

test('flags private, loopback and link-local IPv4 addresses', () => {
  for (const ip of ['127.0.0.1', '10.0.0.5', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0']) {
    assert.equal(isPrivateIp(ip), true, ip);
  }
});

test('allows public IPv4 addresses', () => {
  for (const ip of ['8.8.8.8', '1.1.1.1', '172.15.0.1', '172.32.0.1', '100.128.0.1', '93.184.216.34']) {
    assert.equal(isPrivateIp(ip), false, ip);
  }
});

test('flags private IPv6 addresses, including IPv4-mapped ones', () => {
  for (const ip of ['::1', '::', 'fc00::1', 'fd12:3456::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1']) {
    assert.equal(isPrivateIp(ip), true, ip);
  }
  assert.equal(isPrivateIp('2606:4700:4700::1111'), false);
});

test('rejects missing, malformed and non-web URLs', async () => {
  await assert.rejects(validateTarget(''), TargetError);
  await assert.rejects(validateTarget('not a url'), TargetError);
  await assert.rejects(validateTarget('ftp://example.com'), TargetError);
  await assert.rejects(validateTarget('file:///etc/passwd'), TargetError);
  await assert.rejects(validateTarget('javascript:alert(1)'), TargetError);
});

test('rejects URLs with embedded credentials', async () => {
  await assert.rejects(validateTarget('https://user:pass@example.com'), TargetError);
});

test('refuses local and private hosts by default', async () => {
  await assert.rejects(validateTarget('http://127.0.0.1:3000'), /private or local/);
  await assert.rejects(validateTarget('http://169.254.169.254/latest/meta-data'), /private or local/);
  await assert.rejects(validateTarget('http://[::1]:8080'), /private or local/);
  await assert.rejects(validateTarget('http://localhost'), /private or local/);
});

test('allows local hosts only when explicitly enabled', async () => {
  const url = await validateTarget('http://127.0.0.1:3000/page', { allowPrivateNetwork: true });
  assert.equal(url.href, 'http://127.0.0.1:3000/page');
});
