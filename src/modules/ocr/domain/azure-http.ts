/**
 * Azure Document Intelligence REST (2024-11-30): analyze + poll.
 * Server-only. Credentials never leave this module toward the client.
 *
 * Native Hebrew (`he`) on prebuilt-invoice / prebuilt-receipt — do not require
 * queryFields. keyValuePairs is free on S0 but not supported on F0 free tier.
 * queryFields is paid and opt-in (S0 only).
 */

import {
  AZURE_API_VERSION,
  AZURE_HEBREW_LOCALE,
  AZURE_ISRAEL_QUERY_FIELDS,
} from './model-strategy';
import 'server-only';

import {
  OCR_POLL_INTERVAL_MS,
  OCR_PROVIDER_TIMEOUT_MS,
  OCR_TRANSIENT_RETRY_LIMIT,
} from './cost-controls';
import { isAzureQueryFieldsEnabled, resolveAzureCapabilities } from './provider-capabilities';

export interface AzureAnalyzeFeatures {
  /** Free add-on on S0; false on F0 (Azure rejects the feature). */
  readonly keyValuePairs?: boolean;
  /**
   * Paid Query Fields. Only appended when explicitly enabled for S0.
   * Never used as the Hebrew extraction path.
   */
  readonly queryFields?: readonly string[];
}

export interface AzureAnalyzeOperation {
  readonly status: 'notStarted' | 'running' | 'succeeded' | 'failed' | 'canceled' | string;
  readonly createdDateTime?: string;
  readonly lastUpdatedDateTime?: string;
  readonly error?: { readonly code?: string; readonly message?: string };
  readonly analyzeResult?: unknown;
}

export interface AzureHttpTransport {
  analyze(input: {
    endpoint: string;
    apiKey: string;
    model: string;
    body: Record<string, unknown>;
    pages: string;
    locale?: string;
    features?: AzureAnalyzeFeatures;
    signal: AbortSignal;
  }): Promise<{ operationLocation: string }>;
  getResult(
    operationLocation: string,
    apiKey: string,
    signal: AbortSignal,
  ): Promise<AzureAnalyzeOperation>;
}

function trimEndpoint(endpoint: string): string {
  return endpoint.replace(/\/+$/, '');
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
      },
      { once: true },
    );
  });
}

export function sanitizeAzureUserMessage(status: number, providerMessage?: string): string {
  void providerMessage;
  if (status === 401 || status === 403) return 'Document reading is not authorized';
  if (status === 429) return 'Document reading is busy; try again shortly';
  if (status >= 500) return 'Document reading service is unavailable';
  if (status === 400) return 'The file could not be read';
  return 'Document reading failed';
}

/** Build analyze query flags from tier + optional call overrides. */
export function resolveAzureAnalyzeFeatures(
  overrides?: AzureAnalyzeFeatures,
): AzureAnalyzeFeatures {
  const capabilities = resolveAzureCapabilities();
  const keyValuePairs = overrides?.keyValuePairs ?? capabilities.keyValuePairs;
  const queryFields =
    overrides?.queryFields ??
    (isAzureQueryFieldsEnabled(capabilities.tier === 'S0' ? 'S0' : 'F0')
      ? [...AZURE_ISRAEL_QUERY_FIELDS]
      : []);
  return {
    keyValuePairs,
    queryFields: queryFields.length > 0 ? queryFields : undefined,
  };
}

export const defaultAzureHttpTransport: AzureHttpTransport = {
  async analyze(input) {
    const endpoint = trimEndpoint(input.endpoint);
    const features = resolveAzureAnalyzeFeatures(input.features);
    const query = new URLSearchParams({
      'api-version': AZURE_API_VERSION,
      locale: input.locale ?? AZURE_HEBREW_LOCALE,
      pages: input.pages,
    });
    if (features.keyValuePairs) {
      query.set('features', 'keyValuePairs');
    }
    for (const field of features.queryFields ?? []) {
      query.append('queryFields', field);
    }
    const url = `${endpoint}/documentintelligence/documentModels/${encodeURIComponent(input.model)}:analyze?${query.toString()}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Ocp-Apim-Subscription-Key': input.apiKey,
      },
      body: JSON.stringify(input.body),
      signal: input.signal,
    });

    if (response.status !== 202 && !response.ok) {
      const error = new Error(sanitizeAzureUserMessage(response.status));
      (error as Error & { status?: number }).status = response.status;
      throw error;
    }

    const operationLocation =
      response.headers.get('operation-location') ?? response.headers.get('Operation-Location');
    if (!operationLocation) {
      const error = new Error('Document reading failed');
      (error as Error & { status?: number }).status = response.status;
      throw error;
    }
    return { operationLocation };
  },

  async getResult(operationLocation, apiKey, signal) {
    const response = await fetch(operationLocation, {
      method: 'GET',
      headers: { 'Ocp-Apim-Subscription-Key': apiKey },
      signal,
    });
    if (!response.ok) {
      const error = new Error(sanitizeAzureUserMessage(response.status));
      (error as Error & { status?: number }).status = response.status;
      throw error;
    }
    return (await response.json()) as AzureAnalyzeOperation;
  },
};

export async function analyzeAzureDocument(input: {
  endpoint: string;
  apiKey: string;
  model: string;
  base64Source: string;
  pages: string;
  locale?: string;
  features?: AzureAnalyzeFeatures;
  transport?: AzureHttpTransport;
  timeoutMs?: number;
}): Promise<AzureAnalyzeOperation> {
  const transport = input.transport ?? defaultAzureHttpTransport;
  const timeoutMs = input.timeoutMs ?? OCR_PROVIDER_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const runAnalyze = async () =>
    transport.analyze({
      endpoint: input.endpoint,
      apiKey: input.apiKey,
      model: input.model,
      body: { base64Source: input.base64Source },
      pages: input.pages,
      locale: input.locale,
      features: input.features,
      signal: controller.signal,
    });

  try {
    let started: { operationLocation: string } | null = null;
    let attempt = 0;
    while (!started) {
      try {
        started = await runAnalyze();
      } catch (error) {
        const status = (error as { status?: number }).status;
        const abort = error instanceof Error && error.name === 'AbortError';
        if (abort) {
          const timeout = new Error('Document reading timed out');
          (timeout as Error & { code?: string }).code = 'timeout';
          throw timeout;
        }
        if (status === 429 && attempt < OCR_TRANSIENT_RETRY_LIMIT) {
          attempt += 1;
          await sleep(OCR_POLL_INTERVAL_MS * 2, controller.signal);
          continue;
        }
        throw error;
      }
    }

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const operation = await transport.getResult(
        started.operationLocation,
        input.apiKey,
        controller.signal,
      );
      if (
        operation.status === 'succeeded' ||
        operation.status === 'failed' ||
        operation.status === 'canceled'
      ) {
        return operation;
      }
      await sleep(OCR_POLL_INTERVAL_MS, controller.signal);
    }

    const timeout = new Error('Document reading timed out');
    (timeout as Error & { code?: string }).code = 'timeout';
    throw timeout;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      const timeout = new Error('Document reading timed out');
      (timeout as Error & { code?: string }).code = 'timeout';
      throw timeout;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
