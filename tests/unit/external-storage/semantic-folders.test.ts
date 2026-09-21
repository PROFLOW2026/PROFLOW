import { describe, expect, it } from 'vitest';
import { semanticFolderForDocumentOwner, semanticFolderForTaskAttachment } from '@/modules/external-storage/domain/semantic-folders';

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

describe('semanticFolderForTaskAttachment', () => {
  it('keeps task photos in the project photos folder', () => {
    expect(semanticFolderForTaskAttachment('photo', 'general_files')).toBe('photos');
    expect(semanticFolderForTaskAttachment(null, 'photos')).toBe('photos');
  });

  it('keeps task documents in the project general files folder', () => {
    expect(semanticFolderForTaskAttachment('document', 'photos')).toBe('general_files');
    expect(semanticFolderForTaskAttachment(null, 'documents')).toBe('general_files');
  });
});
