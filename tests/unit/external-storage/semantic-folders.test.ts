import { describe, expect, it } from 'vitest';
import { semanticFolderForDocumentOwner } from '@/modules/external-storage/domain/semantic-folders';

describe('semanticFolderForDocumentOwner', () => {
  it('maps expense to vendor_invoices', () => {
    expect(semanticFolderForDocumentOwner('expense')).toBe('vendor_invoices');
  });

  it('maps ap_bill to vendor_invoices', () => {
    expect(semanticFolderForDocumentOwner('ap_bill')).toBe('vendor_invoices');
  });

  it('maps field ops to photos', () => {
    expect(semanticFolderForDocumentOwner('daily_log')).toBe('photos');
  });
});
