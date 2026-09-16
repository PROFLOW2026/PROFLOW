import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage, type RGB } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { ServiceUnavailableError } from '@/shared/errors';
import type { DocumentBrandContext, HeaderLayout } from '@/modules/branding/domain/document-brand';
import { reportFilename } from '../domain/paths';
import type { ReportPayload } from '../domain/types';
import { getReportsCopy } from '../domain/copy';
import { formatReportGeneratedAt } from './generate-report';
import {
  ACCENT_BAR_HEIGHT,
  LOGO_MAX_HEIGHT,
  LOGO_MAX_WIDTH,
  buildCompanyDetailsBlock,
  buildFooterLine,
  buildFooterParts,
  brandedHeaderHeight,
  companyDetailLines,
  companyInitials,
  logoContainSize,
  resolveEffectiveBrand,
  resolvePdfBrandColors,
  selectLogoForWhitePaper,
} from './branded-document-shell';

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 48;
const HEADER_NAME_LOGO_GAP = 14;
const HEADER_NAME_MIN_SIZE = 11;
const HEADER_NAME_MAX_SIZE = 13;
const FONT_SIZE = 11;
const TITLE_SIZE = 18;
const HEADING_SIZE = 13;
const LINE_HEIGHT = 15;
const BODY_COLOR = rgb(0.05, 0.05, 0.05);
const HEBREW_RE = /[\u0590-\u05FF]/;
/** Printable ASCII safe for pdf-lib StandardFonts (WinAnsi). */
const WIN_ANSI_SAFE_RE = /^[\t\n\r\x20-\x7E]*$/;
const TEXT_RUN_RE =
  /[\u0590-\u05FF][\u0590-\u05FF\s]*|[0-9A-Za-z][0-9A-Za-z\s.,:/\-]*|[^\u0590-\u05FF0-9A-Za-z]+/g;

const HEBREW_FONT_REGULAR = 'NotoSansHebrew-Regular.ttf';
const HEBREW_FONT_BOLD = 'NotoSansHebrew-Bold.ttf';
const HEBREW_FONT_PROJECT_REL = path.join('src', 'modules', 'reports', 'fonts', HEBREW_FONT_REGULAR);

let hebrewFontBytes: Uint8Array | null | undefined;
let hebrewBoldFontBytes: Uint8Array | null | undefined;

/** Stable project-root path — matches Vercel output file tracing includes. */
export function hebrewFontFilePath(): string {
  return path.join(process.cwd(), HEBREW_FONT_PROJECT_REL);
}

/** Module-relative path — works in local dev / vitest without a production bundle. */
export function hebrewFontModulePath(): string {
  return path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fonts', HEBREW_FONT_REGULAR);
}

export function hebrewBoldFontFilePath(): string {
  return path.join(process.cwd(), 'src', 'modules', 'reports', 'fonts', HEBREW_FONT_BOLD);
}

export function hebrewBoldFontModulePath(): string {
  return path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fonts', HEBREW_FONT_BOLD);
}

export function hebrewBoldFontCandidatePaths(): readonly string[] {
  return [hebrewBoldFontFilePath(), hebrewBoldFontModulePath()];
}

export function hebrewFontCandidatePaths(): readonly string[] {
  return [hebrewFontFilePath(), hebrewFontModulePath()];
}

async function loadFontBytes(
  readCache: () => Uint8Array | null | undefined,
  writeCache: (value: Uint8Array | null) => void,
  candidates: readonly string[],
  label: string,
): Promise<Uint8Array | null> {
  const cached = readCache();
  if (cached !== undefined) return cached;
  for (const candidate of candidates) {
    try {
      const bytes = await readFile(candidate);
      writeCache(bytes);
      return bytes;
    } catch (error) {
      console.warn(`[renderReportPdf] ${label} not readable at`, candidate, error);
    }
  }
  writeCache(null);
  return null;
}

async function loadHebrewFontBytes(): Promise<Uint8Array | null> {
  return loadFontBytes(
    () => hebrewFontBytes,
    (value) => {
      hebrewFontBytes = value;
    },
    hebrewFontCandidatePaths(),
    'Hebrew regular font',
  );
}

async function loadHebrewBoldFontBytes(): Promise<Uint8Array | null> {
  return loadFontBytes(
    () => hebrewBoldFontBytes,
    (value) => {
      hebrewBoldFontBytes = value;
    },
    hebrewBoldFontCandidatePaths(),
    'Hebrew bold font',
  );
}

export type PdfTextRunKind = 'hebrew' | 'latin' | 'unicode';

export type PdfTextRun = {
  text: string;
  kind: PdfTextRunKind;
};

/** True when every codepoint is encodable by StandardFonts Helvetica (WinAnsi). */
export function isWinAnsiEncodable(text: string): boolean {
  return WIN_ANSI_SAFE_RE.test(text);
}

/** Classify a text chunk for pdf-lib font selection (logical order, no BiDi reversal). */
export function classifyPdfTextRun(text: string): PdfTextRunKind {
  if (HEBREW_RE.test(text)) return 'hebrew';
  if (isWinAnsiEncodable(text)) return 'latin';
  return 'unicode';
}

/** Embedded Noto Sans Hebrew is used for Hebrew and non-WinAnsi Unicode (e.g. ₪, –, ״). */
export function pdfRunUsesEmbeddedFont(kind: PdfTextRunKind): boolean {
  return kind !== 'latin';
}

/** Split mixed Hebrew/Latin/Unicode strings for pdf-lib (logical order, no BiDi reversal). */
export function splitPdfTextRuns(text: string): PdfTextRun[] {
  const runs: PdfTextRun[] = [];
  for (const match of text.matchAll(TEXT_RUN_RE)) {
    const chunk = match[0];
    if (!chunk) continue;
    runs.push({
      text: chunk,
      kind: classifyPdfTextRun(chunk),
    });
  }
  if (runs.length === 0) {
    return [{ text, kind: classifyPdfTextRun(text) }];
  }
  return runs;
}

function needsSplitFontRendering(text: string): boolean {
  const runs = splitPdfTextRuns(text);
  if (runs.length <= 1) return false;
  const hasLatin = runs.some((run) => run.kind === 'latin');
  const hasEmbedded = runs.some((run) => pdfRunUsesEmbeddedFont(run.kind));
  return hasLatin && hasEmbedded;
}

function pdfRenderFailedError(detail: string): ServiceUnavailableError {
  return new ServiceUnavailableError(detail, 'generatedDocuments.errors.pdfRenderFailed');
}

/** Normalize whitespace; preserve logical Hebrew order (pdf-lib + Noto render RTL correctly). */
export function shapeForPdf(text: string, _dir: 'rtl' | 'ltr'): string {
  return text.replace(/\s+/g, ' ').trim();
}

const RTL_ROW_GAP = '    ';

/** PDF-only copy cleanup for RTL — does not affect HTML preview or payload builders. */
export function simplifyPdfText(text: string, dir: 'rtl' | 'ltr'): string {
  if (dir !== 'rtl') return text;
  return text
    .replace(/\s*\(([^)]+)\)/g, ' - $1')
    .replace(/\s*\[([^\]]+)\]/g, ' $1')
    .replace(/[\u2013\u2014–—]/g, '-')
    .replace(/\s*\|\s*/g, RTL_ROW_GAP);
}

function normalizePdfText(text: string, dir: 'rtl' | 'ltr'): string {
  return simplifyPdfText(shapeForPdf(text, dir), dir);
}

/** Whitespace only — preserves legal/display punctuation exactly. */
export function normalizeExactPdfText(text: string, dir: 'rtl' | 'ltr'): string {
  return shapeForPdf(text, dir);
}

export function measurePdfTextExact(
  text: string,
  fonts: PdfFonts,
  size: number,
  bold: boolean,
  dir: 'rtl' | 'ltr',
): number {
  const normalized = normalizeExactPdfText(text, dir);
  if (!normalized) return 0;
  return pdfBodyFont(fonts, dir, bold).widthOfTextAtSize(normalized, size);
}

export function drawPdfTextExact(
  page: PDFPage,
  text: string,
  xLeft: number,
  y: number,
  size: number,
  fonts: PdfFonts,
  dir: 'rtl' | 'ltr',
  color: RGB,
  bold: boolean,
): void {
  const normalized = normalizeExactPdfText(text, dir);
  if (!normalized) return;
  page.drawText(normalized, {
    x: xLeft,
    y,
    size,
    font: pdfBodyFont(fonts, dir, bold),
    color,
  });
}

/** Simple numeric timestamp for RTL PDF footers (avoids localized punctuation). */
export function formatPdfGeneratedAt(generatedAtIso: string): string {
  const d = new Date(generatedAtIso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function pdfGeneratedLabel(
  copy: ReturnType<typeof getReportsCopy>,
  generatedAtIso: string,
  locale: string,
  dir: 'rtl' | 'ltr',
): string {
  if (dir === 'rtl') {
    return `נוצר: ${formatPdfGeneratedAt(generatedAtIso)}`;
  }
  return `${copy.generatedAt} ${formatReportGeneratedAt(generatedAtIso, locale)}`;
}

function pdfTableSeparator(dir: 'rtl' | 'ltr'): string {
  return dir === 'rtl' ? RTL_ROW_GAP : ' | ';
}

function pdfTableLine(cells: readonly string[], dir: 'rtl' | 'ltr'): string {
  const ordered = dir === 'rtl' ? [...cells].reverse() : cells;
  return ordered.join(pdfTableSeparator(dir));
}

function pdfBodyFont(fonts: PdfFonts, dir: 'rtl' | 'ltr', bold: boolean): PDFFont {
  if (dir === 'rtl') return bold ? fonts.hebrewBold : fonts.hebrew;
  return bold ? fonts.latinBold : fonts.latin;
}

/** Standalone ISO 3166-1 alpha-2 line — omitted from PDF letterhead only. */
export function isPdfCountryCodeLine(line: string): boolean {
  return /^[A-Z]{2}$/.test(line.trim());
}

/** PDF header: drop country-code address lines without mutating stored org/brand data. */
export function filterPdfHeaderAddressLines(
  addressLines: readonly string[] | undefined,
): readonly string[] {
  return (addressLines ?? []).filter((line) => !isPdfCountryCodeLine(line));
}

function pdfBrandForRendering(brand: DocumentBrandContext): DocumentBrandContext {
  const addressLines = filterPdfHeaderAddressLines(brand.addressLines);
  if (addressLines.length === (brand.addressLines ?? []).length) return brand;
  return { ...brand, addressLines };
}

/** RTL lines with Hebrew + digits need per-run placement; all runs still use Noto. */
function rtlNeedsRunSplit(text: string): boolean {
  return splitPdfTextRuns(text).length > 1;
}

type PdfFonts = {
  hebrew: PDFFont;
  hebrewBold: PDFFont;
  latin: PDFFont;
  latinBold: PDFFont;
};

function pickFont(run: PdfTextRun, fonts: PdfFonts, bold: boolean): PDFFont {
  if (run.kind === 'latin') return bold ? fonts.latinBold : fonts.latin;
  return bold ? fonts.hebrewBold : fonts.hebrew;
}

function measurePdfText(
  text: string,
  fonts: PdfFonts,
  size: number,
  bold: boolean,
  dir: 'rtl' | 'ltr',
): number {
  const normalized = normalizePdfText(text, dir);
  if (!normalized) return 0;
  if (dir === 'rtl') {
    const font = pdfBodyFont(fonts, dir, bold);
    if (!rtlNeedsRunSplit(normalized)) {
      return font.widthOfTextAtSize(normalized, size);
    }
    return splitPdfTextRuns(normalized).reduce(
      (sum, run) => sum + font.widthOfTextAtSize(run.text, size),
      0,
    );
  }
  if (!needsSplitFontRendering(normalized)) {
    return pdfBodyFont(fonts, dir, bold).widthOfTextAtSize(normalized, size);
  }
  return splitPdfTextRuns(normalized).reduce(
    (sum, run) => sum + pickFont(run, fonts, bold).widthOfTextAtSize(run.text, size),
    0,
  );
}

function drawPdfText(
  page: PDFPage,
  text: string,
  xLeft: number,
  y: number,
  size: number,
  fonts: PdfFonts,
  dir: 'rtl' | 'ltr',
  color: RGB,
  bold: boolean,
): void {
  const normalized = normalizePdfText(text, dir);
  if (!normalized) return;

  if (dir === 'rtl') {
    const font = pdfBodyFont(fonts, dir, bold);
    if (!rtlNeedsRunSplit(normalized)) {
      page.drawText(normalized, { x: xLeft, y, size, font, color });
      return;
    }
    const parts = splitPdfTextRuns(normalized).map((run) => ({
      text: run.text,
      font,
      width: font.widthOfTextAtSize(run.text, size),
    }));
    let x = xLeft;
    for (const part of [...parts].reverse()) {
      page.drawText(part.text, { x, y, size, font: part.font, color });
      x += part.width;
    }
    return;
  }

  if (!needsSplitFontRendering(normalized)) {
    page.drawText(normalized, {
      x: xLeft,
      y,
      size,
      font: pdfBodyFont(fonts, dir, bold),
      color,
    });
    return;
  }

  const parts = splitPdfTextRuns(normalized).map((run) => ({
    ...run,
    font: pickFont(run, fonts, bold),
    width: pickFont(run, fonts, bold).widthOfTextAtSize(run.text, size),
  }));
  let x = xLeft;
  for (const part of parts) {
    page.drawText(part.text, { x, y, size, font: part.font, color });
    x += part.width;
  }
}

function wrapText(
  text: string,
  fonts: PdfFonts,
  size: number,
  maxWidth: number,
  dir: 'rtl' | 'ltr',
  bold: boolean,
): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const trial = current ? `${current} ${word}` : word;
    if (measurePdfText(trial, fonts, size, bold, dir) <= maxWidth) {
      current = trial;
      continue;
    }
    if (current) lines.push(current);
    current = word;
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [''];
}

async function embedBrandLogo(
  doc: PDFDocument,
  brand: DocumentBrandContext,
): Promise<PDFImage | null> {
  const selected = selectLogoForWhitePaper(brand);
  if (!selected.bytes || selected.bytes.length === 0) return null;
  const mime = (selected.mime ?? 'image/png').toLowerCase();
  try {
    if (mime.includes('jpeg') || mime.includes('jpg')) {
      return await doc.embedJpg(selected.bytes);
    }
    return await doc.embedPng(selected.bytes);
  } catch {
    try {
      return mime.includes('png')
        ? await doc.embedJpg(selected.bytes)
        : await doc.embedPng(selected.bytes);
    } catch {
      return null;
    }
  }
}

type BrandDrawCtx = {
  fonts: PdfFonts;
  dir: 'rtl' | 'ltr';
  brand: DocumentBrandContext;
  logo: PDFImage | null;
  colors: ReturnType<typeof resolvePdfBrandColors>;
};

function contentWidth() {
  return PAGE_WIDTH - MARGIN * 2;
}

function xFor(dir: 'rtl' | 'ltr', textWidth: number, align: 'start' | 'end' = 'start') {
  if (dir === 'rtl') {
    return align === 'end' ? MARGIN : PAGE_WIDTH - MARGIN - textWidth;
  }
  return align === 'end' ? PAGE_WIDTH - MARGIN - textWidth : MARGIN;
}

function drawAccentBar(page: PDFPage, colors: BrandDrawCtx['colors']) {
  page.drawRectangle({
    x: 0,
    y: PAGE_HEIGHT - ACCENT_BAR_HEIGHT,
    width: PAGE_WIDTH,
    height: ACCENT_BAR_HEIGHT,
    color: rgb(...colors.primary),
  });
}

function logoBlockDimensions(ctx: BrandDrawCtx): { width: number; height: number } {
  if (ctx.logo) {
    return logoContainSize(ctx.logo.width, ctx.logo.height, LOGO_MAX_WIDTH, LOGO_MAX_HEIGHT);
  }
  const badge = Math.min(LOGO_MAX_WIDTH, LOGO_MAX_HEIGHT, 40);
  return { width: badge, height: badge };
}

function fitHeaderNameSize(
  name: string,
  fonts: PdfFonts,
  dir: 'rtl' | 'ltr',
  logoWidth: number,
  gap: number,
): { size: number; width: number } {
  for (let size = HEADER_NAME_MAX_SIZE; size >= HEADER_NAME_MIN_SIZE; size -= 1) {
    const width = measurePdfTextExact(name, fonts, size, true, dir);
    if (width + gap + logoWidth <= contentWidth()) {
      return { size, width };
    }
  }
  const size = HEADER_NAME_MIN_SIZE;
  return { size, width: measurePdfTextExact(name, fonts, size, true, dir) };
}

/** Company name + logo/initials as one centered horizontal group (RTL letterhead). */
function drawCenteredNameLogoRow(
  page: PDFPage,
  ctx: BrandDrawCtx,
  companyName: string,
  top: number,
): number {
  const logoDim = logoBlockDimensions(ctx);
  const { size, width: nameWidth } = fitHeaderNameSize(
    companyName,
    ctx.fonts,
    ctx.dir,
    logoDim.width,
    HEADER_NAME_LOGO_GAP,
  );
  const groupWidth = nameWidth + HEADER_NAME_LOGO_GAP + logoDim.width;
  const groupLeft = (PAGE_WIDTH - groupWidth) / 2;
  const rowBottom = top - logoDim.height;
  const textBaseline = top - logoDim.height / 2 - size / 3;

  drawLogoOrInitials(page, ctx, {
    x: groupLeft,
    y: top,
    maxW: LOGO_MAX_WIDTH,
    maxH: LOGO_MAX_HEIGHT,
  });
  drawPdfTextExact(
    page,
    companyName,
    groupLeft + logoDim.width + HEADER_NAME_LOGO_GAP,
    textBaseline,
    size,
    ctx.fonts,
    ctx.dir,
    BODY_COLOR,
    true,
  );
  return rowBottom;
}

function drawLogoOrInitials(
  page: PDFPage,
  ctx: BrandDrawCtx,
  box: { x: number; y: number; maxW: number; maxH: number },
): void {
  if (ctx.logo) {
    const size = logoContainSize(ctx.logo.width, ctx.logo.height, box.maxW, box.maxH);
    page.drawImage(ctx.logo, {
      x: box.x,
      y: box.y - size.height,
      width: size.width,
      height: size.height,
    });
    return;
  }

  const initials = companyInitials(ctx.brand.companyDisplayName || ctx.brand.companyLegalName);
  if (!initials) return;
  const badge = Math.min(box.maxW, box.maxH, 40);
  page.drawRectangle({
    x: box.x,
    y: box.y - badge,
    width: badge,
    height: badge,
    color: rgb(...ctx.colors.primary),
  });
  const shaped = shapeForPdf(initials, ctx.dir);
  const size = 11;
  const w = ctx.fonts.hebrewBold.widthOfTextAtSize(shaped, size);
  page.drawText(shaped, {
    x: box.x + (badge - w) / 2,
    y: box.y - badge / 2 - size / 3,
    size,
    font: ctx.fonts.hebrewBold,
    color: rgb(...ctx.colors.textOnPrimary),
  });
}

function drawCompanyTextBlock(
  page: PDFPage,
  ctx: BrandDrawCtx,
  opts: { x: number; y: number; maxWidth: number; alignCenter?: boolean; skipPrimary?: boolean },
): number {
  const details = buildCompanyDetailsBlock(ctx.brand);
  const lines = [
    ...(opts.skipPrimary ? [] : [details.primaryName]),
    details.secondaryName,
    ...companyDetailLines(details),
  ].filter(Boolean);

  let y = opts.y;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const isPrimary = !opts.skipPrimary && i === 0;
    const size = isPrimary ? 13 : 9;
    const bold = isPrimary;
    const width = measurePdfTextExact(line, ctx.fonts, size, bold, ctx.dir);
    let x = opts.x;
    if (opts.alignCenter) {
      x = opts.x + (opts.maxWidth - width) / 2;
    } else if (ctx.dir === 'rtl') {
      x = opts.x + opts.maxWidth - width;
    }
    drawPdfTextExact(page, line, x, y, size, ctx.fonts, ctx.dir, BODY_COLOR, bold);
    y -= size + 4;
  }
  return y;
}

/**
 * Draws branded header on a page. Returns the Y cursor below the header for body content.
 */
function drawBrandedHeader(page: PDFPage, ctx: BrandDrawCtx): number {
  const layout: HeaderLayout = ctx.brand.headerLayout ?? 'letterhead';
  drawAccentBar(page, ctx.colors);

  const top = PAGE_HEIGHT - MARGIN - ACCENT_BAR_HEIGHT - 4;
  const headerH = brandedHeaderHeight(layout);
  const bottom = top - headerH;

  if (layout === 'minimal') {
    const details = buildCompanyDetailsBlock(ctx.brand);
    const size = 12;
    const width = measurePdfTextExact(details.primaryName, ctx.fonts, size, true, ctx.dir);
    drawPdfTextExact(
      page,
      details.primaryName,
      xFor(ctx.dir, width),
      top - 14,
      size,
      ctx.fonts,
      ctx.dir,
      BODY_COLOR,
      true,
    );
    // thin accent underline
    page.drawRectangle({
      x: MARGIN,
      y: bottom + 8,
      width: contentWidth(),
      height: 1.5,
      color: rgb(...ctx.colors.accent),
    });
    return bottom;
  }

  if (layout === 'centered') {
    const logoBoxW = LOGO_MAX_WIDTH;
    const logoX = (PAGE_WIDTH - logoBoxW) / 2;
    drawLogoOrInitials(page, ctx, { x: logoX, y: top, maxW: logoBoxW, maxH: LOGO_MAX_HEIGHT });
    const textTop = top - LOGO_MAX_HEIGHT - 6;
    drawCompanyTextBlock(page, ctx, {
      x: MARGIN,
      y: textTop,
      maxWidth: contentWidth(),
      alignCenter: true,
    });
    page.drawRectangle({
      x: MARGIN,
      y: bottom + 6,
      width: contentWidth(),
      height: 1.5,
      color: rgb(...ctx.colors.accent),
    });
    return bottom;
  }

  // letterhead | logo_sides
  const logoOnStart = layout === 'letterhead' || layout === 'logo_sides';
  const details = buildCompanyDetailsBlock(ctx.brand);

  if (ctx.dir === 'rtl' && logoOnStart) {
    const rowBottom = drawCenteredNameLogoRow(page, ctx, details.primaryName, top);
    const hasExtraLines =
      Boolean(details.secondaryName) || companyDetailLines(details).length > 0;
    if (hasExtraLines) {
      drawCompanyTextBlock(page, ctx, {
        x: MARGIN,
        y: rowBottom - 6,
        maxWidth: contentWidth(),
        alignCenter: true,
        skipPrimary: true,
      });
    }
  } else {
    const logoMaxW = LOGO_MAX_WIDTH;
    const logoMaxH = LOGO_MAX_HEIGHT;
    const gap = 12;
    const logoW = logoBlockDimensions(ctx).width;

    let logoX: number;
    let textX: number;
    let textW: number;

    if (ctx.dir === 'rtl') {
      logoX = PAGE_WIDTH - MARGIN - logoW;
      textX = MARGIN;
      textW = contentWidth() - logoW - gap;
    } else {
      logoX = MARGIN;
      textX = MARGIN + logoW + gap;
      textW = contentWidth() - logoW - gap;
    }

    if (logoOnStart) {
      drawLogoOrInitials(page, ctx, { x: logoX, y: top, maxW: logoMaxW, maxH: logoMaxH });
    }

    if (layout === 'logo_sides') {
      if (ctx.dir === 'rtl') {
        textX = MARGIN;
        textW = contentWidth() - logoW - gap;
      } else {
        textX = MARGIN + logoW + gap;
        textW = contentWidth() - logoW - gap;
      }
    }

    drawCompanyTextBlock(page, ctx, { x: textX, y: top - 2, maxWidth: textW });
  }

  page.drawRectangle({
    x: MARGIN,
    y: bottom + 6,
    width: contentWidth(),
    height: 1.5,
    color: rgb(...ctx.colors.accent),
  });

  return bottom;
}

class PdfCursor {
  page: PDFPage;
  y: number;
  pageIndex = 1;

  constructor(
    private readonly doc: PDFDocument,
    private readonly fonts: PdfFonts,
    private readonly dir: 'rtl' | 'ltr',
    private readonly footerLabel: string,
    private readonly brandCtx: BrandDrawCtx | null,
  ) {
    this.page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.y = this.beginPage();
  }

  private beginPage(): number {
    if (this.brandCtx) {
      return drawBrandedHeader(this.page, this.brandCtx) - 8;
    }
    return PAGE_HEIGHT - MARGIN;
  }

  private contentWidth() {
    return contentWidth();
  }

  private xFor(textWidth: number, align: 'start' | 'end' = 'start') {
    return xFor(this.dir, textWidth, align);
  }

  ensure(height: number) {
    const footerReserve = MARGIN + 28;
    if (this.y - height < footerReserve) {
      this.page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      this.pageIndex += 1;
      this.y = this.beginPage();
    }
  }

  drawFooter(pageNumber: number, pageCount: number, brand: DocumentBrandContext | null) {
    const rawLabel = brand
      ? buildFooterLine(
          buildFooterParts(brand, {
            pageNumber,
            pageCount,
            generatedLabel: this.footerLabel,
          }),
        )
      : `${this.footerLabel}  ·  ${pageNumber}/${pageCount}`;
    const label = this.dir === 'rtl' ? rawLabel.replace(/\s·\s/g, '  ') : rawLabel;
    const width = measurePdfText(label, this.fonts, 8, false, this.dir);
    // accent line above footer
    if (brand) {
      const colors = resolvePdfBrandColors(brand);
      this.page.drawRectangle({
        x: MARGIN,
        y: 40,
        width: this.contentWidth(),
        height: 1,
        color: rgb(...colors.accent),
      });
    }
    drawPdfText(this.page, label, this.xFor(width), 28, 8, this.fonts, this.dir, rgb(0.35, 0.35, 0.35), false);
  }

  text(raw: string, opts: { size?: number; bold?: boolean; gap?: number } = {}) {
    const size = opts.size ?? FONT_SIZE;
    const bold = opts.bold ?? false;
    const lines = wrapText(raw, this.fonts, size, this.contentWidth(), this.dir, bold);
    for (const line of lines) {
      this.ensure(LINE_HEIGHT);
      const width = measurePdfText(line, this.fonts, size, bold, this.dir);
      drawPdfText(this.page, line, this.xFor(width), this.y, size, this.fonts, this.dir, BODY_COLOR, bold);
      this.y -= opts.gap ?? LINE_HEIGHT;
    }
  }

  textExact(raw: string, opts: { size?: number; bold?: boolean; gap?: number } = {}) {
    const size = opts.size ?? FONT_SIZE;
    const bold = opts.bold ?? false;
    this.ensure(LINE_HEIGHT);
    const width = measurePdfTextExact(raw, this.fonts, size, bold, this.dir);
    drawPdfTextExact(
      this.page,
      raw,
      this.xFor(width),
      this.y,
      size,
      this.fonts,
      this.dir,
      BODY_COLOR,
      bold,
    );
    this.y -= opts.gap ?? LINE_HEIGHT;
  }

  row(label: string, value: string, nature?: string) {
    if (this.dir === 'rtl') {
      const suffix = nature ? ` ${nature}` : '';
      this.text(`${label}${RTL_ROW_GAP}${value}${suffix}`);
      return;
    }
    const suffix = nature ? ` [${nature}]` : '';
    this.text(`${label}: ${value}${suffix}`);
  }

  identityLine(label: string, value: string) {
    if (this.dir === 'rtl') {
      this.textExact(`${label}${RTL_ROW_GAP}${value}`);
      return;
    }
    this.textExact(`${label}: ${value}`);
  }
}

export async function renderReportPdf(payload: ReportPayload): Promise<Uint8Array> {
  const copy = getReportsCopy(payload.locale);
  const doc = await PDFDocument.create();
  const latin = await doc.embedFont(StandardFonts.Helvetica);
  const latinBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const needsHebrew =
    payload.dir === 'rtl' ||
    HEBREW_RE.test(payload.title) ||
    HEBREW_RE.test(payload.identity.companyName) ||
    (payload.brand
      ? HEBREW_RE.test(payload.brand.companyLegalName) || HEBREW_RE.test(payload.brand.companyDisplayName)
      : false);
  const hebrewBytes = await loadHebrewFontBytes();
  const hebrewBoldBytes = await loadHebrewBoldFontBytes();
  if (needsHebrew && (!hebrewBytes || !hebrewBoldBytes)) {
    throw pdfRenderFailedError('Hebrew PDF font assets could not be loaded');
  }

  let fonts: PdfFonts = {
    hebrew: latin,
    hebrewBold: latinBold,
    latin,
    latinBold,
  };
  if (hebrewBytes && hebrewBoldBytes && needsHebrew) {
    doc.registerFontkit(fontkit);
    try {
      const [hebrew, hebrewBold] = await Promise.all([
        doc.embedFont(hebrewBytes, { subset: true }),
        doc.embedFont(hebrewBoldBytes, { subset: true }),
      ]);
      fonts = { hebrew, hebrewBold, latin, latinBold };
    } catch (error) {
      console.error('[renderReportPdf] Failed to embed Hebrew fonts', error);
      throw pdfRenderFailedError('Hebrew PDF fonts could not be embedded');
    }
  }

  const generatedLabel = pdfGeneratedLabel(copy, payload.generatedAt, payload.locale, payload.dir);
  const brand = resolveEffectiveBrand(
    payload.brand,
    payload.identity.companyName,
    payload.locale,
    payload.dir,
  );
  // Align brand dir with report payload (RTL Hebrew reports).
  const brandAligned: DocumentBrandContext = pdfBrandForRendering({
    ...brand,
    dir: payload.dir,
    locale: payload.locale,
  });
  const logo = await embedBrandLogo(doc, brandAligned);
  const colors = resolvePdfBrandColors(brandAligned);
  const brandCtx: BrandDrawCtx = {
    fonts,
    dir: payload.dir,
    brand: brandAligned,
    logo,
    colors,
  };

  const cursor = new PdfCursor(doc, fonts, payload.dir, generatedLabel, brandCtx);

  cursor.textExact(payload.title, { size: TITLE_SIZE, bold: true, gap: 18 });

  // Project / client identity under letterhead (company already in branded header)
  if (payload.identity.projectName) {
    cursor.identityLine(copy.identity.project, payload.identity.projectName);
  }
  if (payload.identity.projectNumber) {
    cursor.identityLine(copy.identity.projectNumber, payload.identity.projectNumber);
  }
  if (payload.identity.clientName) {
    cursor.identityLine(copy.identity.client, payload.identity.clientName);
  }
  cursor.text(generatedLabel, { gap: 10 });
  cursor.text(copy.snapshotNote, { size: 10, gap: 16 });

  for (const notice of payload.notices) {
    cursor.text(payload.dir === 'rtl' ? notice : `• ${notice}`, { size: 10, gap: 12 });
  }
  cursor.text('', { gap: 8 });

  for (const section of payload.sections) {
    cursor.textExact(section.heading, { size: HEADING_SIZE, bold: true, gap: 16 });
    for (const row of section.rows ?? []) {
      const nature = row.nature ? copy.natures[row.nature] : undefined;
      cursor.row(row.label, row.value, nature);
    }
    for (const table of section.tables ?? []) {
      cursor.text(pdfTableLine(table.headers, payload.dir), { bold: true, size: 10 });
      for (const row of table.rows) {
        cursor.text(pdfTableLine(row, payload.dir), { size: 10, bold: false });
      }
    }
    for (const paragraph of section.paragraphs ?? []) {
      cursor.text(paragraph, { size: 10, gap: 12 });
    }
    cursor.text('', { gap: 8 });
  }

  if (payload.omitted.profit || payload.omitted.compensation || payload.omitted.commercial) {
    cursor.text(copy.sections.omitted, { size: HEADING_SIZE, bold: true, gap: 16 });
    if (payload.omitted.profit) cursor.text(copy.omitted.profit);
    if (payload.omitted.compensation) cursor.text(copy.omitted.compensation);
    if (payload.omitted.commercial) cursor.text(copy.notices.commercialOmitted);
  }

  const pages = doc.getPages();
  pages.forEach((page, index) => {
    cursor.page = page;
    cursor.drawFooter(index + 1, pages.length, brandAligned);
  });

  return doc.save();
}

export function pdfDownloadHeaders(payload: ReportPayload): HeadersInit {
  const filename = reportFilename(payload.kind, new Date(payload.generatedAt), {
    projectName: payload.identity.projectName,
    projectNumber: payload.identity.projectNumber,
    documentLabel: payload.identity.extra ?? payload.title,
  });
  return {
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Cache-Control': 'no-store',
  };
}
