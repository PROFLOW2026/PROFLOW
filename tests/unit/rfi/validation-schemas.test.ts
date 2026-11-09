import { describe, expect, it } from 'vitest';
import {
  createExternalRfiSchema,
  createInternalRfiSchema,
} from '@/modules/rfi/validation/schemas';
import { createExternalSubmittalSchema, createInternalSubmittalSchema } from '@/modules/submittals/validation/schemas';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const DRAWING_ID = '22222222-2222-4222-8222-222222222222';
const REVISION_ID = '33333333-3333-4333-8333-333333333333';
const AGREEMENT_ID = '44444444-4444-4444-8444-444444444444';
const ORG_ID = '55555555-5555-4555-8555-555555555555';

describe('RFI / submittal create schemas accept drawing links', () => {
  it('parses optional drawingId and drawingRevisionId on internal RFI', () => {
    const parsed = createInternalRfiSchema.safeParse({
      projectId: PROJECT_ID,
      subject: 'Clarify footing depth',
      question: 'Is the detail on sheet S-201 current?',
      drawingId: DRAWING_ID,
      drawingRevisionId: REVISION_ID,
      drawingReference: 'S-201 note 3',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.drawingId).toBe(DRAWING_ID);
      expect(parsed.data.drawingRevisionId).toBe(REVISION_ID);
      expect(parsed.data.drawingReference).toBe('S-201 note 3');
    }
  });

  it('coerces empty drawing ids to null on contractor RFI', () => {
    const parsed = createExternalRfiSchema.safeParse({
      organizationId: ORG_ID,
      projectId: PROJECT_ID,
      subject: 'Door hardware',
      question: 'Confirm model per schedule',
      drawingId: '',
      drawingRevisionId: '',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.drawingId).toBeNull();
      expect(parsed.data.drawingRevisionId).toBeNull();
    }
  });

  it('parses drawing fields on internal submittal', () => {
    const parsed = createInternalSubmittalSchema.safeParse({
      projectId: PROJECT_ID,
      subcontractAgreementId: AGREEMENT_ID,
      type: 'product',
      title: 'Storefront mock-up',
      drawingId: DRAWING_ID,
      drawingRevisionId: REVISION_ID,
    });
    expect(parsed.success).toBe(true);
  });

  it('parses drawing fields on contractor submittal', () => {
    const parsed = createExternalSubmittalSchema.safeParse({
      organizationId: ORG_ID,
      projectId: PROJECT_ID,
      type: 'product',
      title: 'Waterproofing data',
      drawingId: DRAWING_ID,
      drawingRevisionId: REVISION_ID,
    });
    expect(parsed.success).toBe(true);
  });
});
