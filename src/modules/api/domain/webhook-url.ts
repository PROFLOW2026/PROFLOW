/**
 * Validates webhook endpoint URLs before persistence.
 * Blocks credentialed URLs, non-HTTP(S) schemes, and common SSRF targets.
 * http is allowed only for loopback hosts (local foundation testing).
 */

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

const BLOCKED_HOSTS = new Set([
  'metadata.google.internal',
  'metadata',
  'instance-data',
]);

function isIpv4(hostname: string): boolean {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname);
}

function ipv4Octets(hostname: string): number[] | null {
  if (!isIpv4(hostname)) return null;
  const parts = hostname.split('.').map((part) => Number(part));
  if (parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return parts;
}

/** True for RFC1918, link-local, loopback, and CGNAT ranges. */
export function isPrivateOrLocalIpv4(hostname: string): boolean {
  const octets = ipv4Octets(hostname);
  if (!octets) return false;
  const [a, b] = octets;
  if (a === undefined || b === undefined) return false;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

/**
 * True for unique-local (fc00::/7), link-local (fe80::/10), and IPv4-mapped
 * private addresses. Loopback (::1) is handled via isLoopbackHost.
 */
export function isPrivateOrLocalIpv6(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host.includes(':')) return false;

  // Dotted IPv4-mapped (::ffff:10.0.0.5)
  const dotted = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(host);
  if (dotted?.[1]) return isPrivateOrLocalIpv4(dotted[1]);

  // Hex IPv4-mapped as produced by URL parsers (::ffff:a00:5 → 10.0.0.5)
  const hexMapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(host);
  if (hexMapped?.[1] && hexMapped[2]) {
    const hi = Number.parseInt(hexMapped[1], 16);
    const lo = Number.parseInt(hexMapped[2], 16);
    if (Number.isFinite(hi) && Number.isFinite(lo)) {
      const a = (hi >> 8) & 0xff;
      const b = hi & 0xff;
      const c = (lo >> 8) & 0xff;
      const d = lo & 0xff;
      return isPrivateOrLocalIpv4(`${a}.${b}.${c}.${d}`);
    }
  }

  // Expand leading compression enough to inspect the first hextet.
  const first = host.startsWith('::')
    ? host.slice(2).split(':')[0] ?? ''
    : host.split(':')[0] ?? '';
  if (!first) return false;

  const n = Number.parseInt(first, 16);
  if (!Number.isFinite(n)) return false;
  // fc00::/7 → 0xfc00–0xfdff; fe80::/10 → 0xfe80–0xfebf
  if (n >= 0xfc00 && n <= 0xfdff) return true;
  if (n >= 0xfe80 && n <= 0xfebf) return true;
  return false;
}

export function isLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (LOOPBACK_HOSTS.has(host)) return true;
  const octets = ipv4Octets(host);
  return Boolean(octets && octets[0] === 127);
}

function isPrivateTargetHost(hostname: string): boolean {
  if (isLoopbackHost(hostname)) return false;
  return isPrivateOrLocalIpv4(hostname) || isPrivateOrLocalIpv6(hostname);
}

export type WebhookUrlRejection =
  | 'invalid_url'
  | 'credentials_forbidden'
  | 'scheme_forbidden'
  | 'host_forbidden'
  | 'private_target';

export function validateWebhookEndpointUrl(raw: string): {
  ok: true;
  url: string;
} | {
  ok: false;
  reason: WebhookUrlRejection;
} {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return { ok: false, reason: 'invalid_url' };
  }

  if (parsed.username || parsed.password) {
    return { ok: false, reason: 'credentials_forbidden' };
  }

  const host = parsed.hostname.toLowerCase();
  if (!host || BLOCKED_HOSTS.has(host) || host.endsWith('.internal')) {
    return { ok: false, reason: 'host_forbidden' };
  }

  if (parsed.protocol === 'https:') {
    if (isPrivateTargetHost(host)) {
      return { ok: false, reason: 'private_target' };
    }
    return { ok: true, url: parsed.toString() };
  }

  if (parsed.protocol === 'http:') {
    if (!isLoopbackHost(host)) {
      return { ok: false, reason: 'scheme_forbidden' };
    }
    return { ok: true, url: parsed.toString() };
  }

  return { ok: false, reason: 'scheme_forbidden' };
}
