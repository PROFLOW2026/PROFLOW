import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import bidiFactory from 'bidi-js';
import { reportFilename } from '../domain/paths';
import type { ReportPayload } from '../domain/types';
import { getReportsCopy } from '../domain/copy';
import { formatReportGeneratedAt } from './generate-report';

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

class PdfCursor {
  page: PDFPage;
  y: number;
  pageIndex = 1;

  constructor(
    private readonly doc: PDFDocument,
    private readonly font: PDFFont,
    private readonly fontBold: PDFFont,
    private readonly dir: 'rtl' | 'ltr',
    private readonly footer: string,
  ) {
    this.page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.y = PAGE_HEIGHT - MARGIN;
  }

  private contentWidth() {
    return PAGE_WIDTH - MARGIN * 2;
  }

  private xFor(textWidth: number, align: 'start' | 'end' = 'start') {
    if (this.dir === 'rtl') {
      return align === 'end' ? MARGIN : PAGE_WIDTH - MARGIN - textWidth;
    }
    return align === 'end' ? PAGE_WIDTH - MARGIN - textWidth : MARGIN;
  }

  ensure(height: number) {
    if (this.y - height < MARGIN + 24) {
      this.page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      this.pageIndex += 1;
      this.y = PAGE_HEIGHT - MARGIN;
    }
  }

  drawFooter(pageNumber: number, pageCount: number) {
    const label = `${this.footer}  ·  ${pageNumber}/${pageCount}`;
    const shaped = shapeForPdf(label, this.dir);
    const width = this.font.widthOfTextAtSize(shaped, 8);
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
  if (hebrewBytes && (payload.dir === 'rtl' || HEBREW_RE.test(payload.title))) {
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
  const cursor = new PdfCursor(doc, font, fontBold, payload.dir, generatedLabel);

  cursor.text(payload.title, { size: TITLE_SIZE, bold: true, gap: 18 });
  cursor.text(`${copy.identity.company}: ${payload.identity.companyName}`, { bold: true });
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
    cursor.drawFooter(index + 1, pages.length);
  });

  return doc.save();
}

export function pdfDownloadHeaders(payload: ReportPayload): HeadersInit {
  const filename = reportFilename(payload.kind, new Date(payload.generatedAt));
  return {
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Cache-Control': 'no-store',
  };
}
