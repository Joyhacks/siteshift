import { lookup } from 'node:dns/promises';
import net from 'node:net';

export class TargetError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TargetError';
  }
}

/**
 * True for loopback, private, link-local, carrier-grade NAT and unspecified
 * addresses. These must never be fetched by a hosted Siteshift server, or a
 * user could point it at internal machines or cloud metadata endpoints (SSRF).
 */
export function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }
  if (net.isIPv6(ip)) {
    const v6 = ip.toLowerCase();
    if (v6.startsWith('::ffff:')) return isPrivateIp(v6.slice(7));
    return (
      v6 === '::' ||
      v6 === '::1' ||
      v6.startsWith('fc') ||
      v6.startsWith('fd') ||
      v6.startsWith('fe8') ||
      v6.startsWith('fe9') ||
      v6.startsWith('fea') ||
      v6.startsWith('feb')
    );
  }
  return false;
}

/**
 * Parses and checks a URL before anything is fetched.
 * Local and private addresses are refused unless allowPrivateNetwork is set,
 * which only the local CLI may do (for capturing your own dev server).
 */
export async function validateTarget(raw, { allowPrivateNetwork = false } = {}) {
  if (!raw || typeof raw !== 'string') {
    throw new TargetError('A URL is required, for example https://example.com');
  }

  let url;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new TargetError(`Not a valid URL: ${raw}`);
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new TargetError('The URL must start with http:// or https://');
  }
  if (url.username || url.password) {
    throw new TargetError('URLs with embedded credentials are not supported.');
  }

  if (!allowPrivateNetwork) {
    const host = url.hostname.replace(/^\[|\]$/g, '');
    let records;
    try {
      records = await lookup(host, { all: true });
    } catch {
      throw new TargetError(`Could not resolve ${url.hostname}. Check the address and your connection.`);
    }
    if (records.some((record) => isPrivateIp(record.address))) {
      throw new TargetError('Refusing to capture a private or local network address.');
    }
  }

  return url;
}
