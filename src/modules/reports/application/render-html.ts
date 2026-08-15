import { getReportsCopy } from '../domain/copy';
import type { ReportPayload } from '../domain/types';
import { formatReportGeneratedAt } from './generate-report';

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
  const identity = [
    [copy.identity.company, payload.identity.companyName],
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

  return `<!DOCTYPE html>
<html lang="${payload.locale === 'he-IL' ? 'he' : 'en'}" dir="${payload.dir}">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(payload.title)}</title>
  <style>
    :root { color-scheme: light; }
    body { font-family: "Noto Sans Hebrew", "Segoe UI", Arial, sans-serif; margin: 24px; color: #111; }
    h1 { font-size: 1.6rem; margin-bottom: 0.25rem; }
    h2 { font-size: 1.1rem; margin-top: 1.5rem; border-bottom: 1px solid #ccc; padding-bottom: 0.25rem; }
    table { width: 100%; border-collapse: collapse; margin: 0.5rem 0 1rem; }
    th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: start; vertical-align: top; }
    table.kv th { width: 34%; background: #f6f6f6; font-weight: 600; }
    .nature { display: inline-block; margin-inline-start: 0.4rem; font-size: 0.75rem; color: #444; }
    .meta, .note { color: #333; font-size: 0.9rem; }
    @media print {
      body { margin: 0; }
      .toolbar { display: none !important; }
    }
  </style>
</head>
<body>
  <h1>${escapeHtml(payload.title)}</h1>
  <p class="meta"><strong>${escapeHtml(copy.generatedAt)}:</strong> ${escapeHtml(generated)}</p>
  <p class="note">${escapeHtml(copy.snapshotNote)}</p>
  ${identity}
  ${notices ? `<ul>${notices}</ul>` : ''}
  ${sections}
</body>
</html>`;
}
