import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('BOQ progress billing VAT UI wiring', () => {
  it('real panel + action expose taxAmount for Billing tax capture', async () => {
    const actions = await readFile('src/modules/boq/ui/actions.ts', 'utf8');
    const panel = await readFile('src/modules/boq/ui/boq-panel-client.tsx', 'utf8');
    const schema = await readFile('src/modules/boq/validation/schemas.ts', 'utf8');
    const createBilling = await readFile(
      'src/modules/boq/application/create-progress-billing.ts',
      'utf8',
    );

    expect(panel).toMatch(/name="taxAmount"/);
    expect(panel).toMatch(/progress\.taxAmount/);
    expect(actions).toMatch(/taxAmount:\s*formData\.get\('taxAmount'\)/);
    expect(schema).toMatch(/taxAmount:\s*decimalString\.optional/);
    expect(createBilling).toMatch(/taxAmount:\s*input\.taxAmount/);
  });
});
