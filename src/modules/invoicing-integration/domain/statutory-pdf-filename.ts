/** Hebrew filename for statutory tax invoice PDF download. */
export function buildStatutoryPdfFileName(externalNumber: string | null | undefined): string {
  const number = externalNumber?.trim() || 'document';
  return `חשבונית-מס-${number}.pdf`;
}

export function statutoryPdfStorageTag(providerId: string, externalId: string): string {
  return `sumit-statutory-pdf:${providerId}:${externalId}`;
}
