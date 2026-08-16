import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const HE_DIR = join(process.cwd(), 'src', 'locales', 'he-IL');

const FORBIDDEN_VALUE_PATTERNS: Array<{ name: string; re: RegExp }> = [
  { name: 'en/em dash', re: /[–—]/ },
  { name: 'neq slogan', re: /≠/ },
  { name: 'Actual english', re: /\bActual\b/ },
  { name: 'OCR acronym', re: /\bOCR\b/ },
  { name: 'Draft only', re: /Draft only/i },
  { name: 'Financial engine', re: /Financial engine/i },
  { name: 'Source of truth', re: /Source of truth/i },
  { name: 'AI slogan', re: /מהפכה בניהול|הדור הבא|פתרון מקצה לקצה|חכם יותר\.\s*מהיר יותר/ },
];

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

describe('he-IL product copy hygiene', () => {
  const files = readdirSync(HE_DIR).filter((f) => f.endsWith('.json'));

  it('audits every he-IL locale file for forbidden visible patterns', () => {
    const hits: string[] = [];
    for (const file of files) {
      const catalog = JSON.parse(readFileSync(join(HE_DIR, file), 'utf8')) as unknown;
      const values: Array<{ path: string; value: string }> = [];
      collectStringValues(catalog, '', values);
      for (const { path, value } of values) {
        for (const pattern of FORBIDDEN_VALUE_PATTERNS) {
          if (pattern.re.test(value)) {
            hits.push(`${file}:${path} [${pattern.name}] ${value}`);
          }
        }
      }
    }
    expect(hits).toEqual([]);
  });

  it('keeps marketing homepage free of portal claims', () => {
    const marketing = readFileSync(join(HE_DIR, 'marketing.json'), 'utf8');
    expect(marketing).not.toMatch(/פורטל לקוחות|פורטל ספקים|customer portal|vendor portal/i);
  });
});
