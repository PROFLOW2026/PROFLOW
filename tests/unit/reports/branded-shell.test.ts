import { describe, expect, it } from 'vitest';
import type { DocumentBrandContext } from '@/modules/branding/domain/document-brand';
import { minimalBrandContext } from '@/modules/branding/domain/document-brand';
import {
  VISUAL_ACKNOWLEDGEMENT_NOTE,
  brandedHeaderHeight,
  buildBrandCssVars,
  buildBrandedDocumentStyles,
  buildCompanyDetailsBlock,
  buildFooterLine,
  buildFooterParts,
  buildHtmlFooter,
  buildHtmlLetterhead,
  buildSignatureSection,
  companyDetailLines,
  companyInitials,
  contrastTextColor,
  logoContainSize,
  parseHexColor,
  resolveEffectiveBrand,
  resolvePdfBrandColors,
  selectLogoForWhitePaper,
} from '@/modules/reports/application/branded-document-shell';
import {
  commercialDocumentFilename,
  reportFilename,
  sanitizeFilenameSegment,
} from '@/modules/reports/domain/paths';
import { renderReportHtmlDocument } from '@/modules/reports/application/render-html';
import type { ReportPayload } from '@/modules/reports/domain/types';

function brand(overrides: Partial<DocumentBrandContext> = {}): DocumentBrandContext {
  return {
    companyLegalName: 'Acme Construction Ltd',
    companyDisplayName: 'Acme',
    primaryColor: '#1a4e8a',
    accentColor: '#2d7dd2',
    headerLayout: 'letterhead',
    theme: 'customer',
    dir: 'ltr',
    locale: 'en',
    addressLines: ['1 Main St'],
    phones: ['+1 555 0100'],
    emails: ['hello@acme.test'],
    website: 'https://acme.test',
    vatNumber: 'IL123',
    registrationNumber: 'REG-9',
    showVatNumber: true,
    showRegistrationNumber: true,
    showWebsite: true,
    ...overrides,
  };
}

describe('branded-document-shell colors', () => {
  it('parses hex and picks contrasting text', () => {
    expect(parseHexColor('#1a4e8a')).toEqual([26, 78, 138]);
    expect(contrastTextColor('#1a4e8a')).toBe('#ffffff');
    expect(contrastTextColor('#f5f5f5')).toBe('#111111');
  });

  it('resolves pdf brand colors with textOnPrimary', () => {
    const colors = resolvePdfBrandColors(brand({ primaryColor: '#eeeeee' }));
    expect(colors.primary[0]).toBeCloseTo(238 / 255, 5);
    expect(colors.textOnPrimary[0]).toBeCloseTo(17 / 255, 5);
  });
});

describe('logo selection and contain sizing', () => {
  it('prefers darkLogoBytes for white paper', () => {
    const dark = new Uint8Array([1, 2, 3]);
    const light = new Uint8Array([9, 9, 9]);
    const selected = selectLogoForWhitePaper(
      brand({
        logoBytes: light,
        logoMime: 'image/png',
        darkLogoBytes: dark,
        darkLogoMime: 'image/png',
        primaryColor: '#ffffff',
      }),
    );
    expect(selected.bytes).toBe(dark);
  });

  it('skips likely-white primary logo when no dark logo', () => {
    const selected = selectLogoForWhitePaper(
      brand({
        logoBytes: new Uint8Array([1]),
        primaryColor: '#fafafa',
        darkLogoBytes: null,
      }),
    );
    expect(selected.bytes).toBeNull();
  });

  it('contain-sizes without cropping or upscaling past max', () => {
    expect(logoContainSize(200, 100, 100, 100)).toEqual({ width: 100, height: 50 });
    expect(logoContainSize(40, 20, 120, 48)).toEqual({ width: 40, height: 20 });
  });
});

describe('company details and initials', () => {
  it('builds detail lines and Hebrew-friendly initials', () => {
    const block = buildCompanyDetailsBlock(brand());
    expect(block.primaryName).toBe('Acme Construction Ltd');
    expect(block.secondaryName).toBe('Acme');
    expect(companyDetailLines(block)).toContain('1 Main St');
    expect(companyDetailLines(block)).toContain('VAT: IL123');
    expect(companyInitials('Acme Construction Ltd')).toBe('AC');
    expect(companyInitials('חברת בדיקה')).toMatch(/\p{L}/u);
  });

  it('varies header height by layout', () => {
    expect(brandedHeaderHeight('minimal')).toBeLessThan(brandedHeaderHeight('letterhead'));
    expect(brandedHeaderHeight('centered')).toBeGreaterThan(brandedHeaderHeight('minimal'));
  });
});

describe('footer builders', () => {
  it('builds footer parts and line', () => {
    const parts = buildFooterParts(brand({ footerText: 'Confidential' }), {
      pageNumber: 2,
      pageCount: 5,
      generatedLabel: 'Generated 21 Aug 2026',
    });
    expect(parts.primary).toBe('Confidential');
    expect(parts.pageLabel).toBe('2/5');
    expect(buildFooterLine(parts)).toContain('Confidential');
    expect(buildFooterLine(parts)).toContain('2/5');
  });
});

describe('HTML letterhead / CSS', () => {
  it('emits CSS vars and layout classes for letterhead', () => {
    const css = buildBrandCssVars(brand());
    expect(css).toContain('--brand-primary:');
    expect(css).toContain('--brand-text-on-primary:');
    const styles = buildBrandedDocumentStyles(brand());
    expect(styles).toContain('@page { size: A4');
    expect(styles).toContain('page-break-inside: avoid');

    const html = buildHtmlLetterhead(brand({ headerLayout: 'centered' }), {
      escapeHtml: (s) => s,
    });
    expect(html).toContain('brand-header--centered');
    expect(html).toContain('brand-accent-bar');
    expect(html).toContain('Acme Construction Ltd');
  });

  it('uses initials when no logo', () => {
    const html = buildHtmlLetterhead(brand({ logoBytes: null, darkLogoBytes: null }), {
      escapeHtml: (s) => s,
    });
    expect(html).toContain('brand-initials');
    expect(html).toContain('AC');
  });

  it('labels signature as visual acknowledgement only', () => {
    const html = buildSignatureSection(
      brand({
        includeSignature: true,
        signatureBytes: new Uint8Array([137, 80, 78, 71]),
        signatureMime: 'image/png',
      }),
      { escapeHtml: (s) => s },
    );
    expect(html).toContain(VISUAL_ACKNOWLEDGEMENT_NOTE);
    expect(html).toContain('brand-signature-note');
  });

  it('labels Hebrew print preview signatures in Hebrew', () => {
    const html = buildSignatureSection(
      brand({
        locale: 'he-IL',
        dir: 'rtl',
        includeSignature: true,
        signatureBytes: new Uint8Array([137, 80, 78, 71]),
        signatureMime: 'image/png',
      }),
      { escapeHtml: (s) => s },
    );
    expect(html).toContain('חתימה או חותמת זו היא אישור חזותי בלבד');
    expect(html).not.toContain('This signature/stamp');
    expect(html).toContain('alt="חתימה"');
  });

  it('buildHtmlFooter includes company footer text', () => {
    const html = buildHtmlFooter(brand({ footerText: 'On site' }), {
      escapeHtml: (s) => s,
      generatedLabel: 'Gen',
    });
    expect(html).toContain('On site');
    expect(html).toContain('brand-footer');
  });
});

describe('resolveEffectiveBrand', () => {
  it('falls back to company name without ProjectFlow branding', () => {
    const resolved = resolveEffectiveBrand(null, 'חברת בדיקה', 'he-IL', 'rtl');
    expect(resolved.companyDisplayName).toBe('חברת בדיקה');
    expect(resolved.dir).toBe('rtl');
    expect(JSON.stringify(resolved).toLowerCase()).not.toContain('projectflow');
  });

  it('passes through provided brand', () => {
    const b = minimalBrandContext('X', 'en', 'ltr');
    expect(resolveEffectiveBrand(b, 'Y', 'en', 'ltr')).toBe(b);
  });
});

describe('professional filenames', () => {
  it('uses Quote- stem and keeps Hebrew segments', () => {
    const name = reportFilename('quote_estimate', new Date('2026-08-21T12:00:00Z'), {
      projectNumber: 'QT-100',
      projectName: 'פרויקט חוף',
    });
    expect(name).toMatch(/^Quote-QT-100-/);
    expect(name).toContain('2026-08-21.pdf');
  });

  it('supports Purchase-Order commercial stem', () => {
    const name = commercialDocumentFilename('Purchase-Order', new Date('2026-08-21T00:00:00Z'), {
      documentNumber: 'PO-12',
      partyName: 'ספק א',
    });
    expect(name.startsWith('Purchase-Order-PO-12-')).toBe(true);
    expect(name).toContain('ספק');
  });

  it('sanitizes path separators and reserved chars', () => {
    expect(sanitizeFilenameSegment('a/b:c*d?.pdf')).not.toMatch(/[\\/:*?"<>|]/);
    expect(sanitizeFilenameSegment('')).toBe('');
  });
});

describe('renderReportHtmlDocument branding', () => {
  it('injects branded shell and RTL dir for Hebrew', () => {
    const payload: ReportPayload = {
      kind: 'project_status',
      title: 'סטטוס פרויקט',
      generatedAt: '2026-08-21T10:00:00.000Z',
      locale: 'he-IL',
      dir: 'rtl',
      identity: {
        companyName: 'חברת בדיקה',
        projectId: 'p1',
        projectName: 'פרויקט',
        projectNumber: 'PRJ-1',
        clientName: 'לקוח',
      },
      notices: [],
      sections: [{ id: 's1', heading: 'סקירה', rows: [{ label: 'סטטוס', value: 'פעיל' }] }],
      omitted: {},
      brand: brand({
        companyLegalName: 'חברת בדיקה בע״מ',
        companyDisplayName: 'חברת בדיקה',
        dir: 'rtl',
        locale: 'he-IL',
        headerLayout: 'letterhead',
      }),
    };

    const html = renderReportHtmlDocument(payload);
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('lang="he"');
    expect(html).toContain('--brand-primary:');
    expect(html).toContain('brand-header');
    expect(html).toContain('חברת בדיקה');
    expect(html).toContain('@page { size: A4');
    expect(html.toLowerCase()).not.toContain('projectflow logo');
  });
});
