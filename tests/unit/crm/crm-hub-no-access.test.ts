import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('CRM opportunities hub no-access copy', () => {
  it('shows noAccess empty state when canRead is false', () => {
    const file = path.join(process.cwd(), 'src/modules/crm/ui/crm-opportunities-hub-view.tsx');
    const source = readFileSync(file, 'utf8');
    expect(source).toContain("t('noAccess.title')");
    expect(source).toContain("t('noAccess.body')");
    expect(source).toMatch(/if \(!canRead\)[\s\S]*noAccess\.title/);
  });
});
