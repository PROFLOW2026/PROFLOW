import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  findDocumentRequirementDuplicates,
  groupDocumentRequirements,
} from '@/app/[locale]/(app)/settings/business-catalogs/_lib/document-requirement-groups';
import type { DocumentRequirementView } from '@/app/[locale]/(app)/settings/business-catalogs/_lib/types';
import {
  localizeDocumentRequirementName,
  resolveSystemDocumentRequirementLabelKey,
} from '@/modules/business-catalog/domain/document-requirement-labels';

const insuranceRow = (
  id: string,
  contextKey: DocumentRequirementView['contextKey'] = 'subcontractor',
): DocumentRequirementView => ({
  id,
  contextKind: 'vendor_type',
  contextKey,
  documentTypeKey: 'insurance',
  label: 'Insurance',
  required: true,
  isActive: true,
});

describe('document requirement localization', () => {
  it('maps system insurance and electrician license by stable identity', () => {
    expect(resolveSystemDocumentRequirementLabelKey('insurance', 'Insurance')).toBe('insurance');
    expect(resolveSystemDocumentRequirementLabelKey('license', 'Electrician license')).toBe(
      'electrician_license',
    );
    expect(localizeDocumentRequirementName('insurance', 'Insurance', 'he-IL')).toBe('ביטוח');
    expect(localizeDocumentRequirementName('insurance', 'Insurance', 'ar')).toBe('تأمين');
    expect(localizeDocumentRequirementName('insurance', 'Insurance', 'ru')).toBe('Страхование');
    expect(localizeDocumentRequirementName('license', 'Electrician license', 'he-IL')).toBe(
      'רישיון חשמלאי',
    );
  });

  it('keeps custom labels untouched', () => {
    expect(localizeDocumentRequirementName('custom_permit', 'Site permit', 'he-IL')).toBe(
      'Site permit',
    );
  });
});

describe('document requirement grouping', () => {
  it('groups repeated insurance rows into one visible requirement', () => {
    const items = [
      insuranceRow('1'),
      insuranceRow('2'),
      insuranceRow('3'),
      {
        id: '4',
        contextKind: 'vendor_type' as const,
        contextKey: 'subcontractor',
        documentTypeKey: 'license',
        label: 'Electrician license',
        required: true,
        isActive: true,
      },
    ];

    const groups = groupDocumentRequirements(items, 'he-IL');
    expect(groups).toHaveLength(2);
    expect(groups[0]?.displayLabel).toBe('ביטוח');
    expect(groups[1]?.displayLabel).toBe('רישיון חשמלאי');
    expect(groups[0]?.rowIds).toEqual(['1', '2', '3']);
  });

  it('merges different contexts for the same system requirement', () => {
    const items = [
      insuranceRow('1', 'subcontractor'),
      insuranceRow('2', 'supplier'),
    ];
    const groups = groupDocumentRequirements(items, 'he-IL');
    expect(groups).toHaveLength(1);
    expect(groups[0]?.contexts).toHaveLength(2);
  });

  it('detects true duplicate DB identities', () => {
    const duplicates = findDocumentRequirementDuplicates([
      insuranceRow('keep'),
      insuranceRow('dup-1'),
    ]);
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0]?.keepId).toBe('keep');
    expect(duplicates[0]?.duplicateIds).toEqual(['dup-1']);
  });
});

describe('document requirement visible label rendering model', () => {
  it('uses localized display label instead of English DB label', () => {
    const group = groupDocumentRequirements([insuranceRow('1')], 'he-IL')[0]!;
    render(<span>{group.displayLabel}</span>);
    expect(screen.getByText('ביטוח')).toBeInTheDocument();
    expect(screen.queryByText('Insurance')).not.toBeInTheDocument();
  });
});
