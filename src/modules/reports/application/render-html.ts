import type { DocumentBrandContext } from '@/modules/branding/domain/document-brand';
import { getReportsCopy } from '../domain/copy';
import type { ReportPayload } from '../domain/types';
import { formatReportGeneratedAt } from './generate-report';
import {
  buildBrandedDocumentStyles,
  buildHtmlFooter,
  buildHtmlLetterhead,
  buildSignatureSection,
  resolveEffectiveBrand,
} from './branded-document-shell';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function renderReportHtmlDocument(payload: ReportPayload): string {
  const copy = getReportsCopy(payload.locale);
  const generated = formatReportGeneratedAt(payload.generatedAt, payload.locale);
  const generatedLabel = `${copy.generatedAt}: ${generated}`;

  const brand = resolveEffectiveBrand(
    payload.brand,
    payload.identity.companyName,
    payload.locale,
    payload.dir,
  );
  const brandAligned: DocumentBrandContext = {
    ...brand,
    dir: payload.dir,
    locale: payload.locale,
  };

  const letterhead = buildHtmlLetterhead(brandAligned, { escapeHtml });
  const footer = buildHtmlFooter(brandAligned, { escapeHtml, generatedLabel });
  const signature = buildSignatureSection(brandAligned, { escapeHtml });
  const styles = buildBrandedDocumentStyles(brandAligned);

  const identity = [
    [copy.identity.project, payload.identity.projectName],
    [copy.identity.projectNumber, payload.identity.projectNumber],
    [copy.identity.client, payload.identity.clientName],
  ]
    .filter((entry): entry is [string, string] => Boolean(entry[1]))
    .map(([label, value]) => `<p><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</p>`)
    .join('');

  const notices = payload.notices
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join('');

  const sections = payload.sections
    .map((section) => {
      const rows = (section.rows ?? [])
        .map((row) => {
          const nature = row.nature ? ` <span class="nature">${escapeHtml(copy.natures[row.nature])}</span>` : '';
          return `<tr><th>${escapeHtml(row.label)}</th><td>${escapeHtml(row.value)}${nature}</td></tr>`;
        })
        .join('');
      const tables = (section.tables ?? [])
        .map((table) => {
          const head = table.headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('');
          const body = table.rows
            .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`)
            .join('');
          return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
        })
        .join('');
      const paragraphs = (section.paragraphs ?? [])
        .map((item) => `<p class="note">${escapeHtml(item)}</p>`)
        .join('');
      return `<section><h2>${escapeHtml(section.heading)}</h2>${
        rows ? `<table class="kv">${rows}</table>` : ''
      }${tables}${paragraphs}</section>`;
    })
    .join('');

  const omitted =
    payload.omitted.profit || payload.omitted.compensation || payload.omitted.commercial
      ? `<section><h2>${escapeHtml(copy.sections.omitted)}</h2>
        ${payload.omitted.profit ? `<p class="note">${escapeHtml(copy.omitted.profit)}</p>` : ''}
        ${payload.omitted.compensation ? `<p class="note">${escapeHtml(copy.omitted.compensation)}</p>` : ''}
        ${payload.omitted.commercial ? `<p class="note">${escapeHtml(copy.notices.commercialOmitted)}</p>` : ''}
      </section>`
      : '';

  return `<!DOCTYPE html>
<html lang="${payload.locale === 'he-IL' ? 'he' : 'en'}" dir="${payload.dir}">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(payload.title)}</title>
  <style>${styles}</style>
</head>
<body>
  <div class="doc-sheet">
    ${letterhead}
    <h1>${escapeHtml(payload.title)}</h1>
    <p class="meta"><strong>${escapeHtml(copy.generatedAt)}:</strong> ${escapeHtml(generated)}</p>
    <p class="note">${escapeHtml(copy.snapshotNote)}</p>
    ${identity}
    ${notices ? `<ul>${notices}</ul>` : ''}
    ${sections}
    ${omitted}
    ${signature}
    ${footer}
  </div>
</body>
</html>`;
}
