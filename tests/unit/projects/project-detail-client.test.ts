import { describe, expect, it } from 'vitest';
import type { CustomFieldValueView } from '@/modules/custom-fields/domain/types';
import type { ProjectDetail } from '@/modules/projects/application/get-project-detail';
import {
  assertPlainForClientBoundary,
  customFieldValuesForClient,
  projectDetailForClient,
} from '@/app/[locale]/(app)/projects/[projectId]/project-detail-client';

function minimalProjectDetail(): ProjectDetail {
  const now = new Date('2026-01-15T10:00:00.000Z');
  return {
    project: {
      id: 'p1',
      organizationId: 'o1',
      name: 'Test',
      documentNumber: 'PRJ-1',
      status: 'active',
      workKind: 'project',
      experienceProfile: null,
      pricingMode: null,
      clientId: null,
      primaryContactId: null,
      currency: 'ILS',
      description: null,
      location: null,
      projectRole: null,
      deliveryMode: null,
      startDate: null,
      targetEndDate: null,
      actualEndDate: null,
      progressPercent: null,
      progressSource: 'manual',
      progressStatus: null,
      notes: null,
      coverImageKey: null,
      coverImageContentType: null,
      coverImageWidth: null,
      coverImageHeight: null,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    },
    clientName: null,
    clientContact: null,
    domainName: null,
    workPackages: [],
    phases: [],
    milestones: [],
    showWorkPackages: true,
    contract: null,
    contracts: [],
    contractValueEvents: [],
    currentContractValue: null,
    originalContractAmountLocked: false,
  };
}

describe('projectDetailForClient', () => {
  it('removes Date instances from project detail for client boundaries', () => {
    const raw = minimalProjectDetail();
    expect(assertPlainForClientBoundary.bind(null, raw)).toThrow();

    const safe = projectDetailForClient(raw);
    expect(() => assertPlainForClientBoundary(safe)).not.toThrow();
    expect(safe.project.createdAt).toBe('2026-01-15T10:00:00.000Z');
  });

  it('removes Date instances from custom field rows', () => {
    const now = new Date('2026-02-01T08:00:00.000Z');
    const fields: CustomFieldValueView[] = [
      {
        definition: {
          id: 'd1',
          organizationId: 'o1',
          entityType: 'project',
          key: 'x',
          label: 'X',
          fieldType: 'text',
          config: {},
          required: false,
          sortOrder: 0,
          archivedAt: null,
          createdAt: now,
          updatedAt: now,
        },
        value: {
          id: 'v1',
          organizationId: 'o1',
          definitionId: 'd1',
          entityId: 'p1',
          valueText: 'hi',
          valueNumber: null,
          valueBool: null,
          valueDate: null,
          valueJson: null,
          createdAt: now,
          updatedAt: now,
        },
      },
    ];

    expect(assertPlainForClientBoundary.bind(null, fields)).toThrow();
    const safe = customFieldValuesForClient(fields);
    expect(() => assertPlainForClientBoundary(safe)).not.toThrow();
  });
});
