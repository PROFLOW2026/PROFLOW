import 'server-only';

import {
  openStorageSecret,
  sealStorageSecret,
} from '@/modules/external-storage/application/token-seal';
import type { InvoicingProviderCredentials } from '../domain/types';

const PAYLOAD_VERSION = 1;

interface SealedInvoicingCredentialPayload {
  readonly v: typeof PAYLOAD_VERSION;
  readonly companyId: number;
  readonly apiKey: string;
}

export function sealInvoicingCredentials(credentials: InvoicingProviderCredentials): string {
  const payload: SealedInvoicingCredentialPayload = {
    v: PAYLOAD_VERSION,
    companyId: credentials.companyId,
    apiKey: credentials.apiKey,
  };
  return sealStorageSecret(JSON.stringify(payload));
}

export function openInvoicingCredentials(sealed: string): InvoicingProviderCredentials {
  const parsed = JSON.parse(openStorageSecret(sealed)) as SealedInvoicingCredentialPayload;
  if (parsed.v !== PAYLOAD_VERSION) {
    throw new Error('Unsupported invoicing credential payload version');
  }
  return {
    companyId: parsed.companyId,
    apiKey: parsed.apiKey,
  };
}
