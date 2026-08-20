/** Public API - downloadable PDF / print report packs. */

export { REPORT_KINDS, DOCUMENT_NAME_CAP } from './domain/types';
export type {
  ReportKind,
  ReportPayload,
  ReportIdentity,
  ReportSection,
  GenerateReportInput,
  ReportOmitted,
  ReportPackOption,
} from './domain/types';
export {
  isReportKind,
  assertReportKindPermission,
  requiredPermissionForKind,
  REPORT_KIND_DEFINITIONS,
} from './domain/kinds';
export { getReportsCopy, resolveReportLocale, reportTitle } from './domain/copy';
export { presentProjectFinancialSummary } from './domain/present-financials';
export { reportDownloadPath, reportPreviewPath, reportFilename } from './domain/paths';
export { generateReport, defaultReportDeps, formatReportGeneratedAt } from './application/generate-report';
export type { ReportDeps } from './application/generate-report';
export { downloadReport } from './application/download-report';
export { renderReportPdf, hebrewFontFilePath } from './application/render-pdf';
export { renderReportHtmlDocument } from './application/render-html';
export { generateReportSchema } from './validation/schemas';
export { loadReportPackCatalog } from './application/load-pack-catalog';
export type { ReportPackCatalog } from './application/load-pack-catalog';
export {
  recommendedReportKindsForPersona,
  prioritizeReportKindsForPersona,
} from './domain/persona-pack-order';
