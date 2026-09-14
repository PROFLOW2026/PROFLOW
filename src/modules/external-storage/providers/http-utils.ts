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

export class ProviderHttpError extends Error {
  constructor(
    readonly status: number,
    readonly bodySnippet: string,
  ) {
    super(`Provider request failed (${status})`);
    this.name = 'ProviderHttpError';
  }

  isQuotaExceeded(): boolean {
    return (
      this.status === 507 ||
      /quotaLimitReached|quota.*limit|quota|storage.*full|insufficient/i.test(this.bodySnippet)
    );
  }

  isUnauthorized(): boolean {
    return this.status === 401 || this.status === 403;
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
