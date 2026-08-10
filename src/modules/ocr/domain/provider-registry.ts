import { AzureDocumentIntelligenceProvider } from './azure-provider';
import type { OcrProvider } from './provider';
import { StubOcrProvider } from './stub-provider';

function readProviderId(): string {
  if (typeof process === 'undefined') return 'stub';
  return process.env.OCR_PROVIDER?.trim().toLowerCase() || 'stub';
}

/**
 * Resolve the process OCR provider from env.
 * Unknown ids fall back to stub (inert — never fabricates amounts).
 */
export function createOcrProviderFromEnv(): OcrProvider {
  const id = readProviderId();
  if (id === 'azure') {
    return new AzureDocumentIntelligenceProvider();
  }
  return new StubOcrProvider();
}

let defaultProvider: OcrProvider | null = null;

export function getOcrProvider(): OcrProvider {
  if (!defaultProvider) {
    defaultProvider = createOcrProviderFromEnv();
  }
  return defaultProvider;
}

/** Test / DI hook — swap the process-wide provider instance. */
export function setOcrProviderForTests(provider: OcrProvider | null): void {
  defaultProvider = provider;
}

export function createDefaultOcrProvider(): OcrProvider {
  return createOcrProviderFromEnv();
}
