import { describe, expect, it } from 'vitest';
import { workerLegendEntrySchema, workerWarningSchema, workerProgressSchema } from '@/modules/electrical-takeoff/domain/contracts';

describe('worker payloads (real worker nullables)', () => {
  it('accepts null legend textBox and null warning scopes', () => {
    const legend = workerLegendEntrySchema.parse({
      key: 'L1',
      fileId: 'f1',
      signature: 'sig',
      signatureKind: 'pdf-shape',
      textBox: null,
      decodedBy: null,
      decodedText: null,
      count: null,
    });
    expect(legend.textBox).toBeNull();
    expect(legend.decodedBy).toBeNull();

    const warning = workerWarningSchema.parse({
      code: 'sheet_partial',
      severity: 'warning',
      message: 'partial',
      sheetKey: null,
      fileId: null,
    });
    expect(warning.sheetKey).toBeNull();
    expect(warning.fileId).toBeNull();
  });

  it('accepts null progress message', () => {
    const progress = workerProgressSchema.parse({
      jobId: 'j1',
      stage: 'classify',
      percent: 10,
      message: null,
    });
    expect(progress.message).toBeNull();
  });
});