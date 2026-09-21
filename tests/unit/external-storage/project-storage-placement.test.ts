import { describe, expect, it } from 'vitest';
import {
  buildProjectInfoText,
  preferredClientRegistration,
} from '@/modules/external-storage/domain/project-info-text';
import {
  isCanonicalProjectRootParent,
  nextStorageProvisionStep,
  projectStorageFolderName,
} from '@/modules/external-storage/domain/project-folder-placement';

describe('direct project storage placement', () => {
  it('names the project folder from the canonical document number', () => {
    expect(projectStorageFolderName('מגדלי פארק', 'PRJ-00126')).toBe('PRJ-00126 - מגדלי פארק');
  });

  it('accepts only a project folder whose parent is projects_root', () => {
    expect(isCanonicalProjectRootParent('projects-root', 'projects-root')).toBe(true);
    expect(isCanonicalProjectRootParent('client-folder', 'projects-root')).toBe(false);
    expect(isCanonicalProjectRootParent('org-root', 'projects-root')).toBe(false);
    expect(isCanonicalProjectRootParent('projects-root', null)).toBe(false);
  });

  it('resumes after a stop and backs off on rate limits without looping forever', () => {
    expect(nextStorageProvisionStep({
      remaining: 4,
      rateLimited: false,
      chain: 0,
      rateLimitStreak: 0,
    }).continue).toBe(true);

    expect(nextStorageProvisionStep({
      remaining: 0,
      rateLimited: false,
      chain: 3,
      rateLimitStreak: 0,
    }).continue).toBe(false);

    const retry = nextStorageProvisionStep({
      remaining: 1,
      rateLimited: true,
      chain: 1,
      rateLimitStreak: 0,
    });
    expect(retry.continue).toBe(true);
    expect(retry.delayMs).toBeGreaterThan(0);

    expect(nextStorageProvisionStep({
      remaining: 1,
      rateLimited: true,
      chain: 2,
      rateLimitStreak: 7,
    }).continue).toBe(false);
  });
});

describe('project info text', () => {
  it('includes the project and the linked client, and omits empty fields', () => {
    const text = buildProjectInfoText({
      projectNumber: 'PRJ-00126',
      projectName: 'מגדלי פארק',
      projectStatus: 'active',
      location: null,
      startDate: '2026-09-21',
      description: 'מגדל מגורים',
      notes: null,
      clientName: 'מרכזים מסחריים השרון',
      clientRegistration: preferredClientRegistration([
        { type: 'company_number', value: '514000000' },
      ]),
      contactName: 'דנה',
      phone: '050-0000000',
      email: null,
      clientAddress: 'הרצליה',
    });
    expect(text).toContain('מספר פרויקט: PRJ-00126');
    expect(text).toContain('שם הפרויקט: מגדלי פארק');
    expect(text).toContain('סטטוס: פעיל');
    expect(text).toContain('שם הלקוח: מרכזים מסחריים השרון');
    expect(text).toContain('ח.פ / עוסק: 514000000');
    expect(text).toContain('איש קשר: דנה');
    expect(text).not.toContain('אימייל:');
    expect(text).not.toContain('מיקום / כתובת:');
    expect(text).toContain('נוצר אוטומטית על ידי ProjectFlow');
  });
});
