import { describe, expect, it, vi } from 'vitest';
import {
  createSumitHttpClient,
  SUMIT_TEST_API_BASE,
} from '@/modules/invoicing-integration/providers/sumit/sumit-http-client';

const PDF_HEADER = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);

describe('SUMIT getpdf', () => {
  it('returns PDF bytes for direct application/pdf response', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe(`${SUMIT_TEST_API_BASE}/accounting/documents/getpdf/`);
      const body = JSON.parse(String(init?.body));
      expect(body.DocumentID).toBe(2375968448);
      expect(body.Original).toBe(true);
      expect(body.Credentials.APIKey).toBe('secret');
      return new Response(PDF_HEADER, {
        status: 200,
        headers: { 'Content-Type': 'application/pdf' },
      });
    });

    const client = createSumitHttpClient(
      { companyId: 1, apiKey: 'secret' },
      { fetchImpl, baseUrl: SUMIT_TEST_API_BASE },
    );

    const pdf = await client.getDocumentPdf('2375968448', true);
    expect(pdf.contentType).toBe('application/pdf');
    expect(pdf.bytes.subarray(0, 4)).toEqual(PDF_HEADER.subarray(0, 4));
  });

  it('sendDocument posts EntityID and EmailAddress', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe(`${SUMIT_TEST_API_BASE}/accounting/documents/send/`);
      const body = JSON.parse(String(init?.body));
      expect(body.EntityID).toBe(2375968448);
      expect(body.EmailAddress).toBe('customer@example.com');
      expect(body.Original).toBe(true);
      return new Response(JSON.stringify({ Status: 0, Data: null }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const client = createSumitHttpClient(
      { companyId: 1, apiKey: 'secret' },
      { fetchImpl, baseUrl: SUMIT_TEST_API_BASE },
    );

    await client.sendDocument({
      documentId: '2375968448',
      emailAddress: 'customer@example.com',
      original: true,
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});
