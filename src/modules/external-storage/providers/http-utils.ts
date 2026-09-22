export async function providerJson<T>(
  url: string,
  init: RequestInit & { accessToken?: string } = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.accessToken) {
    headers.set('Authorization', `Bearer ${init.accessToken}`);
  }
  if (init.body && !headers.has('Content-Type')) {
    if (typeof init.body === 'string') {
      const trimmed = init.body.trimStart();
      headers.set(
        'Content-Type',
        trimmed.startsWith('{') || trimmed.startsWith('[')
          ? 'application/json'
          : 'application/x-www-form-urlencoded',
      );
    } else if (typeof init.body === 'object' && !(init.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }
  }

  const response = await fetch(url, { ...init, headers });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new ProviderHttpError(response.status, text.slice(0, 500));
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/**
 * Provider HTTP 403 bodies that mean throttle / usage-rate limits, not auth failure.
 * Shared across adapters — matched on reason text (Google Drive and similar APIs).
 */
const PROVIDER_THROTTLE_REASON_RE =
  /rateLimitExceeded|userRateLimitExceeded|sharingRateLimitExceeded|dailyLimitExceeded|numRequestsExceed|activityLimitReached|requestsPerSecond|tooManyRequests|throttl(?:ed|ing)?|rate.?limit|retryDelay/i;

export class ProviderHttpError extends Error {
  constructor(
    readonly status: number,
    readonly bodySnippet: string,
  ) {
    super(`Provider request failed (${status})`);
    this.name = 'ProviderHttpError';
  }

  /** True when the body indicates API/user rate limiting (often returned as HTTP 403). */
  isThrottleLike(): boolean {
    return PROVIDER_THROTTLE_REASON_RE.test(this.bodySnippet);
  }

  isQuotaExceeded(): boolean {
    return (
      this.status === 507 ||
      /quotaLimitReached|quota.*limit|quota|storage.*full|insufficient/i.test(this.bodySnippet)
    );
  }

  /**
   * Real auth / permission failures that require Owner reconnect or ACL fix.
   * HTTP 403 alone is not enough — throttle-like 403 must not be treated as auth.
   */
  isUnauthorized(): boolean {
    if (this.status === 401) return true;
    if (this.status === 403) {
      if (this.isThrottleLike()) return false;
      return true;
    }
    return false;
  }

  isTransient(): boolean {
    if (this.status === 408 || this.status === 429 || this.status >= 500) return true;
    // Google Drive (and some others) return 403 with rate-limit reasons.
    if (this.status === 403 && this.isThrottleLike()) return true;
    return false;
  }

  isNameAlreadyExists(): boolean {
    return this.status === 409 && /nameAlreadyExists|name.*already.*exists/i.test(this.bodySnippet);
  }

  isFolderNotEmpty(): boolean {
    return /not\s*empty|folder.*contains|has\s*children|non-empty/i.test(this.bodySnippet);
  }
}

export function toUint8Array(body: ReadableStream<Uint8Array> | Uint8Array): Promise<Uint8Array> {
  if (body instanceof Uint8Array) return Promise.resolve(body);
  return new Response(body).arrayBuffer().then((buf) => new Uint8Array(buf));
}
