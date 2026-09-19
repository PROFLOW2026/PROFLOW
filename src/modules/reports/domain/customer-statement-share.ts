import { reportPreviewPath } from './paths';

/** Locale-prefixed preview path for sharing (requires org login). */
export function customerStatementPreviewPath(clientId: string): string {
  return reportPreviewPath('customer_statement', clientId);
}

export function buildCustomerStatementShareUrl(input: {
  readonly origin: string;
  readonly locale: string;
  readonly clientId: string;
}): string {
  const base = input.origin.replace(/\/+$/, '');
  const path = customerStatementPreviewPath(input.clientId);
  return `${base}/${input.locale}${path}`;
}
