import { describe, expect, it } from 'vitest';
import { hrefForRelatedEntity } from '@/modules/tasks/domain/task-related-work-href';

const PROJECT = '018f1234-5678-7abc-8def-0123456789ab';
const ENTITY = '018f1234-5678-7abc-8def-0123456789cd';

describe('hrefForRelatedEntity', () => {
  it('builds project-scoped execution links', () => {
    expect(hrefForRelatedEntity('rfi', ENTITY, PROJECT)).toBe(`/projects/${PROJECT}/rfi/${ENTITY}`);
    expect(hrefForRelatedEntity('submittal', ENTITY, PROJECT)).toBe(
      `/projects/${PROJECT}/submittals/${ENTITY}`,
    );
  });

  it('builds org field-ops punch link without project', () => {
    expect(hrefForRelatedEntity('punch_list_item', ENTITY, null)).toBe(`/field-ops/punch/${ENTITY}`);
  });

  it('builds task self link', () => {
    expect(hrefForRelatedEntity('task', ENTITY, PROJECT)).toBe(`/tasks/${ENTITY}`);
  });
});
