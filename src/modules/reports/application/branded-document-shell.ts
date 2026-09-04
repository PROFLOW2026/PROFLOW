/**
 * branded-document-shell.ts
 *
 * Pure helpers shared between PDF and HTML renderers for branded letterhead,
 * footer, logo handling, and color utilities.
 *
 * Design rules enforced here:
 *  - Company identity FIRST — no ProjectFlow branding takeover.
 *  - White logo on white paper → prefer darkLogo or skip and use company name.
 *  - Signature/stamp bytes: always labelled as "visual acknowledgement" (NOT legal e-sign).
 *  - RTL: all callers receive dir from DocumentBrandContext / ReportPayload.
 */

import type { DocumentBrandContext, HeaderLayout } from '@/modules/branding/domain/document-brand';
import { minimalBrandContext } from '@/modules/branding/domain/document-brand';

// ── Color utilities ──────────────────────────────────────────────────────────

export const DEFAULT_PRIMARY = '#1a4e8a';
export const DEFAULT_ACCENT = '#2d7dd2';

/** Parses "#rrggbb" → [r, g, b] in 0-255 range. Returns null if unparseable. */
export function parseHexColor(color: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color.trim());
  if (!m) return null;
  return [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)];
}

/** Relative luminance per WCAG 2.1 formula. Input 0-255. */
export function relativeLuminance(r: number, g: number, b: number): number {
  const toLinear = (c: number) => {
    const srgb = c / 255;
    return srgb <= 0.04045 ? srgb / 12.92 : Math.pow((srgb + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/** WCAG 2.1 contrast ratio (returns value ≥ 1). */
export function contrastRatio(fg: [number, number, number], bg: [number, number, number]): number {
  const L1 = Math.max(relativeLuminance(...fg), relativeLuminance(...bg));
  const L2 = Math.min(relativeLuminance(...fg), relativeLuminance(...bg));
  return (L1 + 0.05) / (L2 + 0.05);
}

/** True when the color appears light (luminance > 0.4). */
export function isLightColor(r: number, g: number, b: number): boolean {
  return relativeLuminance(r, g, b) > 0.4;
}

/**
 * Text color that contrasts against a brand primary (accent bars, initials badge).
 * Light primary → dark text; dark primary → white text.
 */
export function contrastTextColor(bgHex: string | null | undefined): '#ffffff' | '#111111' {
  const parsed = parseHexColor(bgHex ?? DEFAULT_PRIMARY) ?? parseHexColor(DEFAULT_PRIMARY)!;
  return isLightColor(...parsed) ? '#111111' : '#ffffff';
}

/** pdf-lib rgb tuple [0–1] for contrast text on primary. */
export function contrastTextPdfRgb(bgHex: string | null | undefined): [number, number, number] {
  const hex = contrastTextColor(bgHex);
  const parsed = parseHexColor(hex)!;
  return [parsed[0] / 255, parsed[1] / 255, parsed[2] / 255];
}

/**
 * Heuristic: primary logo may be invisible on white paper when brand primary is
 * very light (common for "white logo on colored mark" packs). Prefer darkLogo.
 */
export function isLogoLikelyWhite(brand: DocumentBrandContext): boolean {
  if (!brand.logoBytes) return false;
  const color = brand.primaryColor;
  if (!color) return false;
  const parsed = parseHexColor(color);
  if (!parsed) return false;
  return isLightColor(...parsed);
}

/**
 * Picks the best logo bytes for white-paper rendering:
 *  1. darkLogo if available (preferred on white paper).
 *  2. Regular logo only if it is NOT likely white/light.
 *  3. null → fall back to company name / initials.
 */
export function selectLogoForWhitePaper(brand: DocumentBrandContext): {
  bytes: Uint8Array | null;
  mime: string | null;
} {
  if (brand.darkLogoBytes && brand.darkLogoBytes.length > 0) {
    return { bytes: brand.darkLogoBytes, mime: brand.darkLogoMime ?? 'image/png' };
  }
  if (brand.logoBytes && brand.logoBytes.length > 0 && !isLogoLikelyWhite(brand)) {
    return { bytes: brand.logoBytes, mime: brand.logoMime ?? 'image/png' };
  }
  return { bytes: null, mime: null };
}

/**
 * Object-fit: contain sizing — scale image to fit max box without cropping.
 */
export function logoContainSize(
  naturalWidth: number,
  naturalHeight: number,
  maxWidth: number,
  maxHeight: number,
): { width: number; height: number } {
  if (naturalWidth <= 0 || naturalHeight <= 0 || maxWidth <= 0 || maxHeight <= 0) {
    return { width: Math.max(0, maxWidth), height: Math.max(0, maxHeight) };
  }
  const scale = Math.min(maxWidth / naturalWidth, maxHeight / naturalHeight, 1);
  return {
    width: naturalWidth * scale,
    height: naturalHeight * scale,
  };
}

/** Default max logo box for A4 letterhead (PDF points / CSS px scale). */
export const LOGO_MAX_WIDTH = 120;
export const LOGO_MAX_HEIGHT = 48;

// ── Company details text block ───────────────────────────────────────────────

export interface CompanyDetailsBlock {
  /** Primary headline — legal name or display name. */
  primaryName: string;
  /** Secondary line — display name if different from legal, else empty. */
  secondaryName: string;
  /** Formatted address (already joined by separator). */
  address: string;
  /** Phone numbers joined. */
  phones: string;
  /** Emails joined. */
  emails: string;
  website: string;
  vatLine: string;
  regLine: string;
}

/** Separator used between multiple contact details on the same line. */
const DETAIL_SEP = '  ·  ';

export function buildCompanyDetailsBlock(brand: DocumentBrandContext): CompanyDetailsBlock {
  const legal = brand.companyLegalName;
  const display = brand.companyDisplayName;
  const primaryName = legal || display;
  const secondaryName = display && display !== legal ? display : '';

  const address = (brand.addressLines ?? []).join(', ');
  const phones = (brand.phones ?? []).join(DETAIL_SEP);
  const emails = (brand.emails ?? []).join(DETAIL_SEP);
  const website = brand.showWebsite !== false ? (brand.website ?? '') : '';
  const vatLine =
    brand.showVatNumber !== false && brand.vatNumber ? `VAT: ${brand.vatNumber}` : '';
  const regLine =
    brand.showRegistrationNumber !== false && brand.registrationNumber
      ? `Reg: ${brand.registrationNumber}`
      : '';

  return { primaryName, secondaryName, address, phones, emails, website, vatLine, regLine };
}

/** Returns non-empty detail lines in the order: address, phones, emails, website, vat, reg. */
export function companyDetailLines(block: CompanyDetailsBlock): string[] {
  return [
    block.address,
    block.phones,
    block.emails,
    block.website,
    block.vatLine,
    block.regLine,
  ].filter(Boolean);
}

// ── Initials fallback mark ───────────────────────────────────────────────────

/**
 * Derives up to 2 initials from the company display name.
 * "Acme Construction Ltd" → "AC". Hebrew letters are kept as-is (uppercased when applicable).
 */
export function companyInitials(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0 && /\p{L}/u.test(w[0]!));
  if (words.length === 0) return '';
  if (words.length === 1) return words[0]!.slice(0, 2).toLocaleUpperCase();
  return (words[0]![0]! + words[1]![0]!).toLocaleUpperCase();
}

// ── Effective brand resolution ───────────────────────────────────────────────

/**
 * Resolves brand from payload.brand or falls back to companyName identity.
 * Never injects ProjectFlow product branding.
 */
export function resolveEffectiveBrand(
  brand: DocumentBrandContext | null | undefined,
  companyName: string,
  locale: string,
  dir: 'rtl' | 'ltr',
): DocumentBrandContext {
  if (brand) return brand;
  return minimalBrandContext(companyName || 'Company', locale, dir, 'customer');
}

// ── PDF-specific brand helpers ───────────────────────────────────────────────

export interface PdfBrandColors {
  /** Primary bar color as [r, g, b] in 0-1 float range. */
  primary: [number, number, number];
  /** Accent color as [r, g, b] in 0-1 float range. */
  accent: [number, number, number];
  /** Text on primary bar as [r, g, b] in 0-1 float range. */
  textOnPrimary: [number, number, number];
}

/** Converts a hex color to pdf-lib's rgb() tuple [0-1 floats]. */
function hexToPdfRgb(hex: string, fallback: string): [number, number, number] {
  const parsed = parseHexColor(hex) ?? parseHexColor(fallback)!;
  return [parsed[0] / 255, parsed[1] / 255, parsed[2] / 255];
}

export function resolvePdfBrandColors(brand: DocumentBrandContext): PdfBrandColors {
  const primaryHex = brand.primaryColor ?? DEFAULT_PRIMARY;
  return {
    primary: hexToPdfRgb(primaryHex, DEFAULT_PRIMARY),
    accent: hexToPdfRgb(brand.accentColor ?? DEFAULT_ACCENT, DEFAULT_ACCENT),
    textOnPrimary: contrastTextPdfRgb(primaryHex),
  };
}

/** Height in PDF points consumed by the branded header block (below accent bar). */
export function brandedHeaderHeight(layout: HeaderLayout): number {
  switch (layout) {
    case 'minimal':
      return 40;
    case 'centered':
      return 78;
    case 'logo_sides':
      return 72;
    case 'letterhead':
    default:
      return 88;
  }
}

/** Accent bar thickness at the top of each page (PDF points). */
export const ACCENT_BAR_HEIGHT = 6;

export interface HeaderLayoutPlan {
  readonly layout: HeaderLayout;
  readonly dir: 'rtl' | 'ltr';
  /** Content top Y after drawing header (PDF coords, origin bottom-left). */
  readonly contentTopY: number;
  readonly headerHeight: number;
  readonly accentBarHeight: number;
}

export function planBrandedHeader(
  brand: DocumentBrandContext,
  pageHeight: number,
  margin: number,
): HeaderLayoutPlan {
  const layout = brand.headerLayout ?? 'letterhead';
  const headerHeight = brandedHeaderHeight(layout);
  return {
    layout,
    dir: brand.dir,
    accentBarHeight: ACCENT_BAR_HEIGHT,
    headerHeight,
    contentTopY: pageHeight - margin - ACCENT_BAR_HEIGHT - headerHeight,
  };
}

// ── Footer builders ──────────────────────────────────────────────────────────

export interface FooterParts {
  readonly primary: string;
  readonly secondary: string;
  readonly pageLabel: string;
}

export function buildFooterParts(
  brand: DocumentBrandContext,
  opts: {
    pageNumber: number;
    pageCount: number;
    generatedLabel?: string;
    pageOfLabel?: string;
  },
): FooterParts {
  const primary = brand.footerText?.trim() || brand.companyDisplayName || brand.companyLegalName;
  const secondary = brand.footerSecondaryText?.trim() || opts.generatedLabel || '';
  const of = opts.pageOfLabel ?? '/';
  const pageLabel = `${opts.pageNumber}${of}${opts.pageCount}`;
  return { primary, secondary, pageLabel };
}

/** Single-line footer for PDF (primary · secondary · page). */
export function buildFooterLine(parts: FooterParts): string {
  return [parts.primary, parts.secondary, parts.pageLabel].filter(Boolean).join('  ·  ');
}

// ── HTML-specific brand helpers ──────────────────────────────────────────────

/** Encodes raw bytes as a data URL for use in HTML src attributes. */
export function bytesToDataUrl(bytes: Uint8Array, mime: string): string {
  let binary = '';
  const len = bytes.length;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return `data:${mime};base64,${btoa(binary)}`;
}

/**
 * Builds a CSS variable block for brand colors.
 * Injects safe fallbacks so pages render correctly even without a brand.
 */
export function buildBrandCssVars(brand: DocumentBrandContext | null | undefined): string {
  const primary = brand?.primaryColor ?? DEFAULT_PRIMARY;
  const accent = brand?.accentColor ?? DEFAULT_ACCENT;
  const textOnPrimary = contrastTextColor(primary);
  return [
    `--brand-primary: ${primary};`,
    `--brand-accent: ${accent};`,
    `--brand-text-on-primary: ${textOnPrimary};`,
    `--brand-logo-max-width: ${LOGO_MAX_WIDTH}px;`,
    `--brand-logo-max-height: ${LOGO_MAX_HEIGHT}px;`,
  ].join('\n    ');
}

/**
 * Shared print + brand stylesheet fragment (A4, page breaks, header layouts).
 */
export function buildBrandedDocumentStyles(brand: DocumentBrandContext | null | undefined): string {
  const vars = buildBrandCssVars(brand);
  return `
    :root {
      color-scheme: light;
      ${vars}
    }
    * { box-sizing: border-box; }
    body {
      font-family: "Noto Sans Hebrew", "Segoe UI", Arial, sans-serif;
      margin: 0;
      color: #111;
      background: #fff;
    }
    .doc-sheet {
      max-width: 210mm;
      margin: 0 auto;
      padding: 16mm 14mm 18mm;
    }
    .brand-accent-bar {
      height: 6px;
      background: var(--brand-primary);
      margin: -16mm -14mm 12px;
    }
    .brand-header {
      display: flex;
      gap: 1rem;
      align-items: flex-start;
      margin-bottom: 1.25rem;
      padding-bottom: 0.75rem;
      border-bottom: 2px solid var(--brand-accent);
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .brand-header--centered {
      flex-direction: column;
      align-items: center;
      text-align: center;
    }
    .brand-header--minimal {
      border-bottom-width: 1px;
      border-bottom-color: #ccc;
    }
    .brand-header--logo-sides {
      justify-content: space-between;
      align-items: center;
    }
    .brand-logo-cell { flex: 0 0 auto; }
    .brand-info-cell { flex: 1 1 auto; min-width: 0; }
    .brand-logo {
      max-width: var(--brand-logo-max-width);
      max-height: var(--brand-logo-max-height);
      width: auto;
      height: auto;
      object-fit: contain;
      display: block;
    }
    .brand-initials {
      width: 48px;
      height: 48px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--brand-primary);
      color: var(--brand-text-on-primary);
      font-weight: 700;
      font-size: 0.95rem;
      letter-spacing: 0.02em;
    }
    .brand-name-block { display: flex; flex-direction: column; gap: 0.15rem; }
    .brand-legal-name { font-size: 1.15rem; font-weight: 700; color: #111; }
    .brand-display-name { font-size: 0.9rem; color: #444; }
    .brand-contact {
      display: flex;
      flex-wrap: wrap;
      gap: 0.25rem 0.75rem;
      margin-top: 0.35rem;
      font-size: 0.8rem;
      color: #444;
    }
    .brand-footer {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem 1rem;
      justify-content: space-between;
      align-items: baseline;
      margin-top: 2rem;
      padding-top: 0.6rem;
      border-top: 1px solid var(--brand-accent);
      font-size: 0.75rem;
      color: #555;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .brand-footer-primary { font-weight: 600; color: #333; }
    .brand-signature-row {
      display: flex;
      flex-wrap: wrap;
      gap: 1.5rem;
      margin-top: 1.5rem;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .brand-signature-img, .brand-stamp-img {
      max-width: 160px;
      max-height: 64px;
      object-fit: contain;
    }
    .brand-signature-note {
      font-size: 0.7rem;
      color: #666;
      max-width: 220px;
      margin: 0.35rem 0 0;
    }
    h1 { font-size: 1.45rem; margin: 0 0 0.5rem; page-break-after: avoid; }
    h2 {
      font-size: 1.05rem;
      margin-top: 1.25rem;
      border-bottom: 1px solid #ccc;
      padding-bottom: 0.25rem;
      page-break-after: avoid;
      break-after: avoid;
    }
    section { page-break-inside: avoid; break-inside: avoid; }
    table { width: 100%; border-collapse: collapse; margin: 0.5rem 0 1rem; }
    th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: start; vertical-align: top; }
    table.kv th { width: 34%; background: #f6f6f6; font-weight: 600; }
    .nature { display: inline-block; margin-inline-start: 0.4rem; font-size: 0.75rem; color: #444; }
    .meta, .note { color: #333; font-size: 0.9rem; }
    @media print {
      @page { size: A4; margin: 12mm; }
      body { margin: 0; background: #fff; }
      .doc-sheet { max-width: none; padding: 0; }
      .brand-accent-bar { margin: 0 0 10px; }
      .toolbar { display: none !important; }
      h2, section { page-break-inside: avoid; }
      thead { display: table-header-group; }
      tr { page-break-inside: avoid; }
    }
  `;
}

/**
 * Builds the HTML letterhead block for the top of a document.
 * Company identity first; logo only when bytes are available and safe for white paper.
 */
export function buildHtmlLetterhead(
  brand: DocumentBrandContext,
  opts: { escapeHtml: (s: string) => string },
): string {
  const { escapeHtml } = opts;
  const layout = brand.headerLayout ?? 'letterhead';
  const details = buildCompanyDetailsBlock(brand);
  const detailLines = companyDetailLines(details);
  const logo = selectLogoForWhitePaper(brand);

  const logoHtml = logo.bytes
    ? `<img class="brand-logo" src="${bytesToDataUrl(logo.bytes, logo.mime!)}" alt="${escapeHtml(details.primaryName)} logo" />`
    : details.primaryName
      ? `<div class="brand-initials" aria-hidden="true">${escapeHtml(companyInitials(details.primaryName))}</div>`
      : '';

  const nameBlock = `
    <div class="brand-name-block">
      <span class="brand-legal-name">${escapeHtml(details.primaryName)}</span>
      ${details.secondaryName ? `<span class="brand-display-name">${escapeHtml(details.secondaryName)}</span>` : ''}
    </div>`;

  const contactBlock =
    detailLines.length > 0
      ? `<div class="brand-contact">${detailLines.map((l) => `<span>${escapeHtml(l)}</span>`).join('')}</div>`
      : '';

  const accent = `<div class="brand-accent-bar" aria-hidden="true"></div>`;

  if (layout === 'minimal') {
    return `${accent}<header class="brand-header brand-header--minimal">
      ${nameBlock}${contactBlock}
    </header>`;
  }

  if (layout === 'centered') {
    return `${accent}<header class="brand-header brand-header--centered">
      ${logoHtml}${nameBlock}${contactBlock}
    </header>`;
  }

  if (layout === 'logo_sides') {
    return `${accent}<header class="brand-header brand-header--logo-sides">
      <div class="brand-logo-cell">${logoHtml}</div>
      <div class="brand-info-cell">${nameBlock}${contactBlock}</div>
    </header>`;
  }

  // letterhead: logo + info side-by-side (flex direction respects dir)
  return `${accent}<header class="brand-header brand-header--letterhead">
    <div class="brand-logo-cell">${logoHtml}</div>
    <div class="brand-info-cell">${nameBlock}${contactBlock}</div>
  </header>`;
}

/**
 * Builds the HTML footer bar for a document page.
 * Includes footer text from brand, optional page counter placeholder, and accent line.
 */
export function buildHtmlFooter(
  brand: DocumentBrandContext,
  opts: { escapeHtml: (s: string) => string; generatedLabel?: string },
): string {
  const { escapeHtml, generatedLabel } = opts;
  const parts = buildFooterParts(brand, {
    pageNumber: 0,
    pageCount: 0,
    generatedLabel,
  });

  return `<footer class="brand-footer">
    <span class="brand-footer-primary">${escapeHtml(parts.primary)}</span>
    ${parts.secondary ? `<span class="brand-footer-secondary">${escapeHtml(parts.secondary)}</span>` : ''}
    <span class="brand-footer-page"></span>
  </footer>`;
}

const VISUAL_ACKNOWLEDGEMENT_NOTE_HE =
  'חתימה או חותמת זו היא אישור חזותי בלבד ואינה מהווה חתימה אלקטרונית מחייבת.';
const VISUAL_ACKNOWLEDGEMENT_NOTE_EN =
  'This signature/stamp is a visual acknowledgement only and does not constitute a legally binding electronic signature.';

/**
 * Builds the visual-acknowledgement disclaimer for signature/stamp sections.
 * IMPORTANT: must remain visible whenever a signature or stamp image is shown.
 */
export function visualAcknowledgementNote(locale?: string | null): string {
  return locale === 'he-IL' || (locale ?? '').startsWith('he')
    ? VISUAL_ACKNOWLEDGEMENT_NOTE_HE
    : VISUAL_ACKNOWLEDGEMENT_NOTE_EN;
}

/** English default for tests and non-Hebrew renderers. Prefer visualAcknowledgementNote(locale). */
export const VISUAL_ACKNOWLEDGEMENT_NOTE = VISUAL_ACKNOWLEDGEMENT_NOTE_EN;

export function buildSignatureSection(
  brand: DocumentBrandContext,
  opts: { escapeHtml: (s: string) => string },
): string {
  const { escapeHtml } = opts;
  const note = visualAcknowledgementNote(brand.locale);
  const hebrew = brand.locale === 'he-IL' || brand.locale.startsWith('he');
  const signatureAlt = hebrew ? 'חתימה' : 'signature';
  const stampAlt = hebrew ? 'חותמת' : 'stamp';
  const parts: string[] = [];

  if (brand.includeSignature && brand.signatureBytes) {
    const src = bytesToDataUrl(brand.signatureBytes, brand.signatureMime ?? 'image/png');
    parts.push(`<div class="brand-signature">
      <img src="${src}" alt="${escapeHtml(signatureAlt)}" class="brand-signature-img" />
      <p class="brand-signature-note">${escapeHtml(note)}</p>
    </div>`);
  }

  if (brand.includeStamp && brand.stampBytes) {
    const src = bytesToDataUrl(brand.stampBytes, brand.stampMime ?? 'image/png');
    parts.push(`<div class="brand-stamp">
      <img src="${src}" alt="${escapeHtml(stampAlt)}" class="brand-stamp-img" />
      <p class="brand-signature-note">${escapeHtml(note)}</p>
    </div>`);
  }

  return parts.length > 0
    ? `<div class="brand-signature-row">${parts.join('')}</div>`
    : '';
}
