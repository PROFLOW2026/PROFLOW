import type {
  AllocateExternalReferenceInput,
  AllocateExternalReferenceOutput,
  CancelExternalDocumentInput,
  CancelExternalDocumentOutput,
  CreateExternalDocumentInput,
  CreateExternalDocumentOutput,
  CreditExternalDocumentInput,
  CreditExternalDocumentOutput,
  RetrieveExternalStatusInput,
  RetrieveExternalStatusOutput,
  StatutoryInvoicingProvider,
  StatutoryProviderResult,
} from './provider';

function notConfigured<T>(): StatutoryProviderResult<T> {
  return {
    ok: false,
    errorCode: 'not_configured',
    message: 'Statutory invoicing provider is not configured',
  };
}

/**
 * Default provider — feature stays disabled.
 * Does not hardcode a commercial vendor and never issues documents.
 */
export class UnconfiguredStatutoryProvider implements StatutoryInvoicingProvider {
  readonly id = 'unconfigured';

  isConfigured(): boolean {
    return false;
  }

  isFeatureEnabled(): boolean {
    return false;
  }

  async createDocument(
    _input: CreateExternalDocumentInput,
  ): Promise<StatutoryProviderResult<CreateExternalDocumentOutput>> {
    return notConfigured();
  }

  async retrieveStatus(
    _input: RetrieveExternalStatusInput,
  ): Promise<StatutoryProviderResult<RetrieveExternalStatusOutput>> {
    return notConfigured();
  }

  async creditDocument(
    _input: CreditExternalDocumentInput,
  ): Promise<StatutoryProviderResult<CreditExternalDocumentOutput>> {
    return notConfigured();
  }

  async cancelDocument(
    _input: CancelExternalDocumentInput,
  ): Promise<StatutoryProviderResult<CancelExternalDocumentOutput>> {
    return notConfigured();
  }

  async allocateReference(
    _input: AllocateExternalReferenceInput,
  ): Promise<StatutoryProviderResult<AllocateExternalReferenceOutput>> {
    return notConfigured();
  }
}

let defaultProvider: StatutoryInvoicingProvider | null = null;

export function createDefaultStatutoryProvider(): StatutoryInvoicingProvider {
  return new UnconfiguredStatutoryProvider();
}

export function getStatutoryInvoicingProvider(): StatutoryInvoicingProvider {
  if (!defaultProvider) {
    defaultProvider = createDefaultStatutoryProvider();
  }
  return defaultProvider;
}

/** Test / DI hook — swap the process-wide provider. Never wire a fake issuer in production. */
export function setStatutoryInvoicingProviderForTests(
  provider: StatutoryInvoicingProvider | null,
): void {
  defaultProvider = provider;
}
