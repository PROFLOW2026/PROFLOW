import { describe, expect, it } from 'vitest';
import {
  buildStatutoryPdfFileName,
  statutoryPdfStorageTag,
} from '@/modules/invoicing-integration/domain/statutory-pdf-filename';

describe('statutory pdf filename', () => {
  it('builds Hebrew download filename from document number', () => {
    expect(buildStatutoryPdfFileName('20000')).toBe('חשבונית-מס-20000.pdf');
  });

  it('builds stable storage tag from provider and external id', () => {
    expect(statutoryPdfStorageTag('sumit', '2375968448')).toBe(
      'sumit-statutory-pdf:sumit:2375968448',
    );
  });
});
