import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { APPROVAL_ENTITY_TYPES } from '@/modules/approvals/domain/types';
import { COMPLETENESS_CHECK_KEYS } from '@/modules/month-close/domain/types';
import { TIME_APPROVAL_STATUSES } from '@/modules/workforce/domain/types';

const LOCALES = ['he-IL', 'en', 'ar', 'ru'] as const;

const SURFACES: ReadonlyArray<{
  readonly file: string;
  readonly fns: Readonly<Record<string, string>>;
}> = [
  {
    file: 'src/app/[locale]/(app)/workforce/timesheets/page.tsx',
    fns: { t: 'workforce' },
  },
  {
    file: 'src/app/[locale]/(app)/workforce/timesheets/[timesheetId]/page.tsx',
    fns: { t: 'workforce', tDocuments: 'documents' },
  },
  {
    file: 'src/modules/month-close/ui/completeness-checklist.tsx',
    fns: { t: 'monthClose' },
  },
  {
    file: 'src/app/[locale]/(app)/approvals/pending-list.tsx',
    fns: { t: 'approvals' },
  },
  {
    file: 'src/app/[locale]/(app)/settings/approvals/rules-panel.tsx',
    fns: { t: 'approvals', tCommon: 'common' },
  },
  {
    file: 'src/modules/evidence/ui/evidence-uploader.tsx',
    fns: { t: 'projectPlans.evidence.uploader' },
  },
];

const APPROVER_STRATEGIES = ['role_template', 'permission', 'user'] as const;

const DYNAMIC_SUFFIXES: Readonly<Record<string, readonly string[]>> = {
  'checks.': COMPLETENESS_CHECK_KEYS,
  'entityTypes.': APPROVAL_ENTITY_TYPES,
  'steps.strategies.': APPROVER_STRATEGIES,
  'time.approvalStatus.': TIME_APPROVAL_STATUSES,
};

function readLocale(locale: string, namespace: string): unknown {
  const [fileName, ...namespacePath] = namespace.split('.');
  const raw = JSON.parse(readFileSync(join(process.cwd(), 'src/locales', locale, `${fileName}.json`), 'utf8')) as unknown;
  return namespacePath.reduce<unknown>((node, part) => {
    if (!node || typeof node !== 'object' || !(part in node)) return undefined;
    return (node as Record<string, unknown>)[part];
  }, raw);
}

function hasKey(locale: string, namespace: string, key: string): boolean {
  const node = key.split('.').reduce<unknown>((current, part) => {
    if (!current || typeof current !== 'object' || !(part in current)) return undefined;
    return (current as Record<string, unknown>)[part];
  }, readLocale(locale, namespace));
  return typeof node === 'string' && node.trim().length > 0;
}

function keysUsedBy(file: string, fns: Readonly<Record<string, string>>): string[] {
  const source = readFileSync(join(process.cwd(), file), 'utf8');
  const keys: string[] = [];
  const names = Object.keys(fns).join('|');
  const staticCall = new RegExp(String.raw`\b(${names})\(\s*(['"])([^'"]+)\2`, 'g');
  const dynamicCall = new RegExp('\\b(' + names + ')\\(\\s*`([^`$]+)\\$\\{', 'g');
  for (const match of source.matchAll(staticCall)) {
    const fn = match[1] ?? '';
    const key = match[3] ?? '';
    keys.push(`${fns[fn]}:${key}`);
  }
  for (const match of source.matchAll(dynamicCall)) {
    const fn = match[1] ?? '';
    const prefix = match[2] ?? '';
    const suffixes = DYNAMIC_SUFFIXES[prefix];
    if (!suffixes) {
      throw new Error(`${file} uses dynamic ${fns[fn]}:${prefix} without a suffix catalog`);
    }
    for (const suffix of suffixes) keys.push(`${fns[fn]}:${prefix}${suffix}`);
  }
  return keys;
}

describe('touched surface i18n catalogs', () => {
  const used = SURFACES.flatMap((surface) => keysUsedBy(surface.file, surface.fns));

  it('covers the locked month-close, approval, and timesheet keys', () => {
    expect(used).toContain('monthClose:checks.unallocated_attendance_hours');
    expect(used).toContain('monthClose:checks.pending_attendance_corrections');
    expect(used).toContain('approvals:entityTypes.task');
    expect(used).toContain('workforce:timesheets.approvalAfterSubmit');
    expect(used).toContain('projectPlans.evidence.uploader:visibility');
  });

  it('every referenced key exists in he-IL, en, ar, and ru', () => {
    const missing: string[] = [];
    for (const locale of LOCALES) {
      for (const entry of used) {
        const separator = entry.indexOf(':');
        const namespace = entry.slice(0, separator);
        const key = entry.slice(separator + 1);
        if (!hasKey(locale, namespace, key)) missing.push(`${locale} ${namespace}.${key}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
