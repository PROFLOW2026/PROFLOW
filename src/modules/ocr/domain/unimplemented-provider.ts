import type { ExtractDocumentInput, ExtractDocumentResult, OcrProvider } from './provider';

/**
 * Registry placeholder for future providers. No HTTP. Never fabricates fields.
 */
export class UnimplementedOcrProvider implements OcrProvider {
  constructor(readonly id: 'google' | 'aws') {}

  isConfigured(): boolean {
    return false;
  }

  async extractReceipt(input: ExtractDocumentInput): Promise<ExtractDocumentResult> {
    return this.extractDocument(input);
  }

  async extractDocument(_input: ExtractDocumentInput): Promise<ExtractDocumentResult> {
    return {
      ok: false,
      errorCode: 'not_configured',
      message: 'This document reading provider is not connected yet',
      rawMetadata: { providerId: this.id, providerStatus: 'unimplemented' },
    };
  }
}
