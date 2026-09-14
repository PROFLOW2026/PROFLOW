import { describe, expect, it } from 'vitest';
import { semanticFolderForDocumentOwner } from '@/modules/external-storage/domain/semantic-folders';

describe('resolveUploadFolderEntityContext (semantic pairing)', () => {
  it('maps expense and ap_bill attachments to vendor_invoices semantic folder', () => {
    expect(semanticFolderForDocumentOwner('expense')).toBe('vendor_invoices');
    expect(semanticFolderForDocumentOwner('ap_bill')).toBe('vendor_invoices');
    expect(semanticFolderForDocumentOwner('expense', 'receipt')).toBe('vendor_invoices');
  });

  it('maps field ops owners to photos', () => {
    expect(semanticFolderForDocumentOwner('daily_log')).toBe('photos');
    expect(semanticFolderForDocumentOwner('punch_list_item')).toBe('photos');
    expect(semanticFolderForDocumentOwner('inspection')).toBe('photos');
  });
});
