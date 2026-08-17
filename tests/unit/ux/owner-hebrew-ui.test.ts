import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { flattenLocaleCatalog, readLocaleCatalog } from '../shared/i18n-messages.test';

const HE_DIR = join(process.cwd(), 'src', 'locales', 'he-IL');

function collectStringValues(node: unknown, path: string, out: Array<{ path: string; value: string }>) {
  if (typeof node === 'string') {
    out.push({ path, value: node });
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((item, index) => collectStringValues(item, `${path}[${index}]`, out));
    return;
  }
  if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      collectStringValues(value, path ? `${path}.${key}` : key, out);
    }
  }
}

describe('owner-defined Hebrew UI corrections', () => {
  it('quotes UI contains no schema-style copy', () => {
    const quotes = flattenLocaleCatalog(readLocaleCatalog('he-IL', 'quotes'));
    const joined = [...quotes.values()].join('\n');
    expect(joined).not.toMatch(/אובייקט/);
    expect(joined).not.toMatch(/טבלה/);
    expect(joined).not.toMatch(/לא חשבונית, לא/);
    expect(quotes.get('title')).toBe('הצעות מחיר');
    expect(quotes.get('description')).toBe('צרו, ערכו ועקבו אחרי הצעות מחיר ללקוחות.');
  });

  it('projects empty state contains no architecture language', () => {
    const projects = flattenLocaleCatalog(readLocaleCatalog('he-IL', 'projects'));
    expect(projects.get('empty.body')).not.toMatch(/רשומה כספית/);
    expect(projects.get('empty.body')).not.toMatch(/ספר חשבונות נפרד/);
    expect(projects.get('empty.title')).toBe('עדיין אין פרויקטים');
    expect(projects.get('empty.action')).toBe('פרויקט חדש');
  });

  it('field ops uses punch-list wording, not repair-list wording', () => {
    const fieldOps = flattenLocaleCatalog(readLocaleCatalog('he-IL', 'fieldOps'));
    expect(fieldOps.get('description')).toBe(
      'יומני עבודה, רשימת ליקויים, בדיקות ותיעוד מהשטח.',
    );
    expect([...fieldOps.values()].join('\n')).not.toMatch(/רשימות תיקונים/);
  });

  it('work-order user-facing Hebrew uses קריאת שירות', () => {
    expect(flattenLocaleCatalog(readLocaleCatalog('he-IL', 'nav')).get('workOrders')).toBe(
      'קריאות שירות',
    );
    expect(flattenLocaleCatalog(readLocaleCatalog('he-IL', 'search')).get('kinds.work_order')).toBe(
      'קריאת שירות',
    );
    expect(flattenLocaleCatalog(readLocaleCatalog('he-IL', 'service')).get('title')).toBe(
      'קריאות שירות',
    );
  });

  it('quote issued state does not say the quote was sent', () => {
    const status = flattenLocaleCatalog(readLocaleCatalog('he-IL', 'status'));
    expect(status.get('quoteVersion.issued')).toBe('הופקה');
    expect(status.get('estimateQuote.sent')).toBe('הופקה');
    expect(status.get('quoteVersion.issued')).not.toBe('נשלחה');
  });

  it('expense recorded status does not say approved into cost', () => {
    const status = flattenLocaleCatalog(readLocaleCatalog('he-IL', 'status'));
    const expenses = flattenLocaleCatalog(readLocaleCatalog('he-IL', 'expenses'));
    expect(status.get('expense.finalized')).toBe('נרשמה');
    expect(status.get('expense.finalized')).not.toBe('מאושרת לעלות');
    expect(expenses.get('actions.finalize')).toBe('רישום הוצאה');
    expect(expenses.get('confirm.finalizeConsequence')).toBe('ההוצאה תירשם בעלויות הפרויקט.');
  });

  it('financial user-facing copy avoids engine English and AP jargon', () => {
    const namespaces = ['financial', 'dashboard', 'billing', 'ap', 'expenses'] as const;
    const forbidden = /\bActual\b|\bNET\b|\bGROSS\b|\bGL\b|\bledger\b|\bengine\b|\bsnapshot\b|\bimmutable\b|source of truth/i;
    const hits: string[] = [];
    for (const ns of namespaces) {
      for (const [key, value] of flattenLocaleCatalog(readLocaleCatalog('he-IL', ns))) {
        if (forbidden.test(value)) hits.push(`${ns}.${key}: ${value}`);
      }
    }
    expect(hits).toEqual([]);
    const financial = flattenLocaleCatalog(readLocaleCatalog('he-IL', 'financial'));
    expect(financial.get('outstanding')).toBe('יתרה פתוחה');
    expect(financial.get('kpis.actualCostHint')).toBe('העלויות שכבר נרשמו לפרויקט.');
  });

  it('sales navigation is מכירות, not a pipeline slogan', () => {
    expect(flattenLocaleCatalog(readLocaleCatalog('he-IL', 'nav')).get('crm')).toBe('מכירות');
    expect(flattenLocaleCatalog(readLocaleCatalog('he-IL', 'crm')).get('title')).toBe('מכירות');
    const crm = flattenLocaleCatalog(readLocaleCatalog('he-IL', 'crm'));
    expect([...crm.values()].join('\n')).not.toMatch(/צינור מכירות/);
  });

  it('global Hebrew UI has no en dash or em dash', () => {
    const hits: string[] = [];
    for (const file of readdirSync(HE_DIR).filter((name) => name.endsWith('.json'))) {
      const values: Array<{ path: string; value: string }> = [];
      collectStringValues(JSON.parse(readFileSync(join(HE_DIR, file), 'utf8')), '', values);
      for (const { path, value } of values) {
        if (/[–—]/.test(value)) hits.push(`${file}:${path}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it('homepage product images are real PNG captures and the fake SVG generator is retired', () => {
    const marketing = readFileSync(join(HE_DIR, 'marketing.json'), 'utf8');
    expect(marketing).not.toMatch(/pf-landing-sc-\d+/);
    expect(marketing).not.toMatch(/\.svg"/);
    expect(marketing).toMatch(/today-desktop\.png/);
    expect(marketing).not.toMatch(/פורטל לקוחות|פורטל ספקים|customer portal|vendor portal/i);

    const generator = readFileSync(
      join(process.cwd(), 'scripts', 'generate-marketing-screenshots.mjs'),
      'utf8',
    );
    expect(generator).toMatch(/RETIRED/);
    expect(generator).not.toMatch(/function chrome\(/);

    const homepage = readFileSync(
      join(process.cwd(), 'src', 'modules', 'marketing', 'ui', 'public-homepage.tsx'),
      'utf8',
    );
    expect(homepage).not.toMatch(/pf-landing-sc-/);
    expect(homepage).not.toMatch(/\.svg"/);

    const shotDir = join(process.cwd(), 'public', 'marketing', 'screenshots');
    for (const name of [
      'today-desktop.png',
      'today-mobile.png',
      'project-overview-desktop.png',
      'financials-desktop.png',
      'changes-desktop.png',
      'billing-desktop.png',
      'reports-desktop.png',
      'invoice-capture-desktop.png',
      'warnings-desktop.png',
    ]) {
      expect(existsSync(join(shotDir, name)), name).toBe(true);
    }
  });

  it('does not lecture inventory users about FIFO or bookkeeping ledgers', () => {
    const assets = flattenLocaleCatalog(readLocaleCatalog('he-IL', 'assets'));
    expect(assets.get('inventory.qtyOnlyBanner')).toBe('המלאי מציג כמויות לצורך ניהול העבודה.');
    expect([...assets.values()].join('\n')).not.toMatch(/\bFIFO\b|\bAVG\b|\bGL\b|\bledger\b|\bActual\b/);
  });

  it('confirm and delete copy uses the actual noun, not internal engine language', () => {
    const hits: string[] = [];
    const forbidden = /schema|migration|permission key|constraint|worker|queue|claim|SQL|Postgres|This action cannot|cannot be undone/i;
    for (const file of readdirSync(HE_DIR).filter((name) => name.endsWith('.json'))) {
      const values: Array<{ path: string; value: string }> = [];
      collectStringValues(JSON.parse(readFileSync(join(HE_DIR, file), 'utf8')), '', values);
      for (const { path, value } of values) {
        if (!/(confirm|delete|archive|void|warning|success|error)/i.test(path)) continue;
        if (forbidden.test(value)) hits.push(`${file}:${path}: ${value}`);
      }
    }
    expect(hits).toEqual([]);
  });
});
