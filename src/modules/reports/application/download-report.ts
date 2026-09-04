import type { OrgContext } from '@/shared/auth/context';
import type { GenerateReportInput, ReportPayload } from '../domain/types';
import { generateReport } from './generate-report';
import { renderReportHtmlDocument } from './render-html';

export interface ReportDownloadResult {
  readonly payload: ReportPayload;
  readonly body: Uint8Array | string;
  readonly headers: HeadersInit;
}

/** Report file download is retired. Callers receive the printable HTML document. */
export async function downloadReport(
  context: OrgContext,
  input: GenerateReportInput,
  _format: 'pdf' | 'html' = 'html',
): Promise<ReportDownloadResult> {
  const payload = await generateReport(context, input);
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
