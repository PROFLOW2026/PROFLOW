import { AzureDocumentIntelligenceProvider } from './azure-provider';
import { buildFixtureCandidates } from './field-mapping';
import type { OcrProvider } from './provider';
import { ScriptedOcrProvider, StubOcrProvider } from './stub-provider';
import { UnimplementedOcrProvider } from './unimplemented-provider';

function envTruthy(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
}

function readProviderId(): string {
  if (typeof process === 'undefined') return 'stub';
  return process.env.OCR_PROVIDER?.trim().toLowerCase() || 'stub';
}

/**
 * Deterministic e2e/mock transport — never calls Azure HTTP.
 * Enabled only when OCR_E2E_MOCK_PROVIDER is set (Playwright harness).
 */
function isE2eMockProviderEnabled(): boolean {
  if (typeof process === 'undefined') return false;
  return envTruthy(process.env.OCR_E2E_MOCK_PROVIDER);
}

/**
 * Resolve the process OCR provider from env.
 * Unknown ids fall back to stub (inert — never fabricates amounts).
 * google/aws are registry slots only — no fake HTTP.
 */
export function createOcrProviderFromEnv(): OcrProvider {
  if (isE2eMockProviderEnabled()) {
    return new ScriptedOcrProvider(buildFixtureCandidates());
  }
  const id = readProviderId();
  if (id === 'azure') {
    return new AzureDocumentIntelligenceProvider();
  }
  if (id === 'google' || id === 'aws') {
    return new UnimplementedOcrProvider(id);
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
