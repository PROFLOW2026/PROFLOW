import { describe, expect, it } from 'vitest';

import { takeoffExportDownloadHeaders } from '@/modules/electrical-takeoff/application/export-download';

describe('takeoffExportDownloadHeaders', () => {
  it('builds a Response with Hebrew analysis title filenames', () => {
    const fileName = 'ניתוח חדש.xlsx';
    const headers = takeoffExportDownloadHeaders(
      fileName,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    const body = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
    expect(() => new Response(body, { headers })).not.toThrow();
    const cd = String((headers as Record<string, string>)['Content-Disposition']);
    expect(cd).toContain('filename*=');
    expect(cd).not.toContain('ניתוח');
  });
});