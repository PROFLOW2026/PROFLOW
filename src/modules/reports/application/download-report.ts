import type { OrgContext } from '@/shared/auth/context';
import type { GenerateReportInput, ReportPayload } from '../domain/types';
import { generateReport } from './generate-report';
import { pdfDownloadHeaders, renderReportPdf } from './render-pdf';
import { renderReportHtmlDocument } from './render-html';

export interface ReportDownloadResult {
  readonly payload: ReportPayload;
  readonly body: Uint8Array | string;
  readonly headers: HeadersInit;
}

export async function downloadReport(
  context: OrgContext,
  input: GenerateReportInput,
  format: 'pdf' | 'html' = 'pdf',
): Promise<ReportDownloadResult> {
  const payload = await generateReport(context, input);
  if (format === 'html') {
    const body = renderReportHtmlDocument(payload);
    return {
      payload,
      body,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `inline; filename="${payload.kind}.html"`,
        'Cache-Control': 'no-store',
      },
    };
  }
  const body = await renderReportPdf(payload);
  return { payload, body, headers: pdfDownloadHeaders(payload) };
}
