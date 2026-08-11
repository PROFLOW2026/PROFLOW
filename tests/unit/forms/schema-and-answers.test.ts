import { describe, expect, it } from 'vitest';
import { normalizeFormAnswers } from '@/modules/forms/domain/answers';
import {
  emptyAnswersForSchema,
  parseFormTemplateSchema,
  templateRequiresAcknowledgement,
} from '@/modules/forms/domain/schema';

describe('form template schema', () => {
  it('parses supported field types including checklist and signature', () => {
    const schema = parseFormTemplateSchema({
      version: 1,
      fields: [
        {
          key: 'ppe',
          type: 'checklist',
          label: 'PPE',
          required: true,
          items: ['Helmet', 'Boots'],
        },
        { key: 'safe', type: 'yes_no', label: 'Site safe?', required: true },
        { key: 'ack', type: 'signature', label: 'Acknowledge', required: true },
      ],
    });

    expect(schema.fields).toHaveLength(3);
    expect(schema.fields[0]?.items?.[0]?.label).toBe('Helmet');
    expect(templateRequiresAcknowledgement(schema)).toBe(true);
  });

  it('rejects empty schema', () => {
    expect(() => parseFormTemplateSchema({ version: 1, fields: [] })).toThrow();
  });
});

describe('form answers', () => {
  const schema = parseFormTemplateSchema({
    version: 1,
    fields: [
      {
        key: 'ppe',
        type: 'checklist',
        label: 'PPE',
        required: true,
        items: [
          { key: 'helmet', label: 'Helmet' },
          { key: 'boots', label: 'Boots' },
        ],
      },
      { key: 'notes', type: 'notes', label: 'Notes' },
      { key: 'ack', type: 'signature', label: 'Ack', required: true },
    ],
  });

  it('allows incomplete drafts', () => {
    const normalized = normalizeFormAnswers(schema, emptyAnswersForSchema(schema), {
      requireComplete: false,
    });
    expect(normalized.answers.ppe).toEqual({ helmet: false, boots: false });
    expect(normalized.requiresAcknowledgement).toBe(true);
  });

  it('requires checklist and acknowledgement on submit', () => {
    expect(() =>
      normalizeFormAnswers(
        schema,
        { ppe: { helmet: false, boots: false }, ack: { acknowledged: false } },
        { requireComplete: true },
      ),
    ).toThrow();

    const ok = normalizeFormAnswers(
      schema,
      {
        ppe: { helmet: true, boots: false },
        notes: 'All good',
        ack: { acknowledged: true },
      },
      { requireComplete: true },
    );
    expect(ok.answers.notes).toBe('All good');
  });
});
