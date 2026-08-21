import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import bidiFactory from 'bidi-js';
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
const FONT_SIZE = 10;
const TITLE_SIZE = 16;
const HEADING_SIZE = 12;
const LINE_HEIGHT = 14;
const HEBREW_RE = /[\u0590-\u05FF]/;

const bidi = bidiFactory();

let hebrewFontBytes: Uint8Array | null | undefined;

export function hebrewFontFilePath(): string {
  return path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fonts', 'NotoSansHebrew-Regular.ttf');
}

async function loadHebrewFontBytes(): Promise<Uint8Array | null> {
  if (hebrewFontBytes !== undefined) return hebrewFontBytes;
  try {
    hebrewFontBytes = await readFile(hebrewFontFilePath());
    return hebrewFontBytes;
  } catch {
    hebrewFontBytes = null;
    return null;
  }
}

function shapeForPdf(text: string, dir: 'rtl' | 'ltr'): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  try {
    const embedding = bidi.getEmbeddingLevels(normalized, dir);
    const chars = [...normalized];
    const segments = bidi.getReorderSegments(normalized, embedding);
    for (const range of segments) {
      const start = range[0] ?? 0;
      const end = range[1] ?? start;
      const slice = chars.slice(start, end + 1).reverse();
      chars.splice(start, end - start + 1, ...slice);
    }
    return chars.join('');
  } catch {
    return normalized;
  }
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const trial = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(trial, size) <= maxWidth) {
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
  font: PDFFont;
  fontBold: PDFFont;
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
  const w = ctx.fontBold.widthOfTextAtSize(shaped, size);
  page.drawText(shaped, {
    x: box.x + (badge - w) / 2,
    y: box.y - badge / 2 - size / 3,
    size,
    font: ctx.fontBold,
    color: rgb(...ctx.colors.textOnPrimary),
  });
}

function drawCompanyTextBlock(
  page: PDFPage,
  ctx: BrandDrawCtx,
  opts: { x: number; y: number; maxWidth: number; alignCenter?: boolean },
): number {
  const details = buildCompanyDetailsBlock(ctx.brand);
  const lines = [
    details.primaryName,
    details.secondaryName,
    ...companyDetailLines(details),
  ].filter(Boolean);

  let y = opts.y;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const size = i === 0 ? 12 : 8;
    const font = i === 0 ? ctx.fontBold : ctx.font;
    const shaped = shapeForPdf(line, ctx.dir);
    const width = font.widthOfTextAtSize(shaped, size);
    let x = opts.x;
    if (opts.alignCenter) {
      x = opts.x + (opts.maxWidth - width) / 2;
    } else if (ctx.dir === 'rtl') {
      x = opts.x + opts.maxWidth - width;
    }
    page.drawText(shaped, {
      x,
      y,
      size,
      font,
      color: rgb(0.1, 0.1, 0.1),
    });
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
    const shaped = shapeForPdf(details.primaryName, ctx.dir);
    const size = 11;
    const width = ctx.fontBold.widthOfTextAtSize(shaped, size);
    page.drawText(shaped, {
      x: xFor(ctx.dir, width),
      y: top - 14,
      size,
      font: ctx.fontBold,
      color: rgb(0.1, 0.1, 0.1),
    });
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

  // letterhead | logo_sides: logo on start edge, details on the other side
  const logoOnStart = layout === 'letterhead' || layout === 'logo_sides';
  const logoMaxW = LOGO_MAX_WIDTH;
  const logoMaxH = LOGO_MAX_HEIGHT;
  const gap = 12;
  const logoW = ctx.logo
    ? logoContainSize(ctx.logo.width, ctx.logo.height, logoMaxW, logoMaxH).width
    : Math.min(40, logoMaxW);

  let logoX: number;
  let textX: number;
  let textW: number;

  if (ctx.dir === 'rtl') {
    // start edge is right
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
    // push company block toward the opposite edge
    if (ctx.dir === 'rtl') {
      textX = MARGIN;
      textW = contentWidth() - logoW - gap;
    } else {
      textX = MARGIN + logoW + gap;
      textW = contentWidth() - logoW - gap;
    }
  }

  drawCompanyTextBlock(page, ctx, { x: textX, y: top - 2, maxWidth: textW });

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
    private readonly font: PDFFont,
    private readonly fontBold: PDFFont,
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
    const label = brand
      ? buildFooterLine(
          buildFooterParts(brand, {
            pageNumber,
            pageCount,
            generatedLabel: this.footerLabel,
          }),
        )
      : `${this.footerLabel}  ·  ${pageNumber}/${pageCount}`;
    const shaped = shapeForPdf(label, this.dir);
    const width = this.font.widthOfTextAtSize(shaped, 8);
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
    this.page.drawText(shaped, {
      x: this.xFor(width),
      y: 28,
      size: 8,
      font: this.font,
      color: rgb(0.35, 0.35, 0.35),
    });
  }

  text(raw: string, opts: { size?: number; bold?: boolean; gap?: number } = {}) {
    const size = opts.size ?? FONT_SIZE;
    const font = opts.bold ? this.fontBold : this.font;
    const shaped = shapeForPdf(raw, this.dir);
    const lines = wrapText(shaped, font, size, this.contentWidth());
    for (const line of lines) {
      this.ensure(LINE_HEIGHT);
      const width = font.widthOfTextAtSize(line, size);
      this.page.drawText(line, {
        x: this.xFor(width),
        y: this.y,
        size,
        font,
        color: rgb(0.1, 0.1, 0.1),
      });
      this.y -= opts.gap ?? LINE_HEIGHT;
    }
  }

  row(label: string, value: string, nature?: string) {
    const suffix = nature ? ` [${nature}]` : '';
    this.text(`${label}: ${value}${suffix}`);
  }
}

export async function renderReportPdf(payload: ReportPayload): Promise<Uint8Array> {
  const copy = getReportsCopy(payload.locale);
  const doc = await PDFDocument.create();
  const latin = await doc.embedFont(StandardFonts.Helvetica);
  const latinBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const hebrewBytes = await loadHebrewFontBytes();
  let font = latin;
  let fontBold = latinBold;
  const needsHebrew =
    payload.dir === 'rtl' ||
    HEBREW_RE.test(payload.title) ||
    HEBREW_RE.test(payload.identity.companyName) ||
    (payload.brand
      ? HEBREW_RE.test(payload.brand.companyLegalName) || HEBREW_RE.test(payload.brand.companyDisplayName)
      : false);
  if (hebrewBytes && needsHebrew) {
    doc.registerFontkit(fontkit);
    try {
      const embedded = await doc.embedFont(hebrewBytes, { subset: true });
      font = embedded;
      fontBold = embedded;
    } catch {
      font = latin;
      fontBold = latinBold;
    }
  }

  const generatedLabel = `${copy.generatedAt} ${formatReportGeneratedAt(payload.generatedAt, payload.locale)}`;
  const brand = resolveEffectiveBrand(
    payload.brand,
    payload.identity.companyName,
    payload.locale,
    payload.dir,
  );
  // Align brand dir with report payload (RTL Hebrew reports).
  const brandAligned: DocumentBrandContext = { ...brand, dir: payload.dir, locale: payload.locale };
  const logo = await embedBrandLogo(doc, brandAligned);
  const colors = resolvePdfBrandColors(brandAligned);
  const brandCtx: BrandDrawCtx = {
    font,
    fontBold,
    dir: payload.dir,
    brand: brandAligned,
    logo,
    colors,
  };

  const cursor = new PdfCursor(doc, font, fontBold, payload.dir, generatedLabel, brandCtx);

  cursor.text(payload.title, { size: TITLE_SIZE, bold: true, gap: 18 });

  // Project / client identity under letterhead (company already in branded header)
  if (payload.identity.projectName) {
    cursor.text(`${copy.identity.project}: ${payload.identity.projectName}`);
  }
  if (payload.identity.projectNumber) {
    cursor.text(`${copy.identity.projectNumber}: ${payload.identity.projectNumber}`);
  }
  if (payload.identity.clientName) {
    cursor.text(`${copy.identity.client}: ${payload.identity.clientName}`);
  }
  cursor.text(generatedLabel, { gap: 10 });
  cursor.text(copy.snapshotNote, { size: 9, gap: 16 });

  for (const notice of payload.notices) {
    cursor.text(`• ${notice}`, { size: 9, gap: 12 });
  }
  cursor.text('', { gap: 8 });

  for (const section of payload.sections) {
    cursor.text(section.heading, { size: HEADING_SIZE, bold: true, gap: 16 });
    for (const row of section.rows ?? []) {
      const nature = row.nature ? copy.natures[row.nature] : undefined;
      cursor.row(row.label, row.value, nature);
    }
    for (const table of section.tables ?? []) {
      cursor.text(table.headers.join(' | '), { bold: true, size: 9 });
      for (const row of table.rows) {
        cursor.text(row.join(' | '), { size: 9 });
      }
    }
    for (const paragraph of section.paragraphs ?? []) {
      cursor.text(paragraph, { size: 9, gap: 12 });
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
