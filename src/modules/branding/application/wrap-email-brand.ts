import { sanitizeOptionalBrandText } from '../domain/sanitize-text';
import type { DocumentBrandContext } from '../domain/document-brand';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/**
 * Wrap outbound email HTML with company identity / footer / signature plain text.
 * Brand strings are escaped — never injected as raw HTML from user-controlled brand fields.
 */
export function wrapCommunicationHtmlWithBrand(
  brand: DocumentBrandContext,
  bodyHtml: string | null | undefined,
  bodyText: string,
): { readonly html: string; readonly text: string } {
  const company = brand.companyDisplayName || brand.companyLegalName;
  const footer = sanitizeOptionalBrandText(brand.footerText) ?? company;
  const signature = sanitizeOptionalBrandText(brand.emailSignatureText ?? brand.footerSecondaryText);

  const safeCompany = escapeHtml(company);
  const safeFooter = escapeHtml(footer);
  const safeSignature = signature ? escapeHtml(signature) : null;

  const inner =
    bodyHtml && bodyHtml.trim().length > 0
      ? bodyHtml
      : `<p>${escapeHtml(bodyText).replaceAll('\n', '<br />')}</p>`;

  const html = `<!DOCTYPE html>
<html lang="${brand.locale === 'he-IL' ? 'he' : 'en'}" dir="${brand.dir}">
<body style="font-family:Segoe UI,Arial,sans-serif;color:#111;margin:0;padding:16px;">
  <div style="margin-bottom:16px;font-weight:600;">${safeCompany}</div>
  <div>${inner}</div>
  <hr style="border:none;border-top:1px solid #ddd;margin:24px 0 12px;" />
  <div style="font-size:12px;color:#444;">
    <div>${safeFooter}</div>
    ${safeSignature ? `<div style="margin-top:8px;white-space:pre-wrap;">${safeSignature}</div>` : ''}
  </div>
</body>
</html>`;

  const textParts = [company, '', bodyText, '', footer];
  if (signature) textParts.push('', signature);
  return { html, text: textParts.join('\n') };
}
