/**
 * Strip HTML / script from custom footer and terms fields (plain text only).
 */

/** Removes tags, entities that decode to tags, and control characters. */
export function sanitizeBrandPlainText(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  let text = String(raw);

  // Decode a few common entities before stripping so `&lt;script&gt;` cannot survive.
  text = text
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&amp;/gi, '&');

  // Remove script/style blocks entirely.
  text = text.replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, ' ');
  // Strip remaining tags.
  text = text.replace(/<[^>]*>/g, ' ');
  // Collapse whitespace; drop C0 controls except tab/newline → space.
  text = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  text = text.replace(/[ \t\f\v]+/g, ' ');
  text = text.replace(/\n{3,}/g, '\n\n');
  text = text.trim();

  return text.length > 0 ? text : null;
}

export function sanitizeOptionalBrandText(
  raw: string | null | undefined,
  maxLength = 8000,
): string | null {
  const cleaned = sanitizeBrandPlainText(raw);
  if (cleaned == null) return null;
  return cleaned.length > maxLength ? cleaned.slice(0, maxLength) : cleaned;
}
