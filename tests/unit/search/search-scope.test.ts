import { describe, expect, it } from 'vitest';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  apBillSearchHref,
  billingRecordSearchHref,
  clientSearchHref,
  contractSearchHref,
  documentSearchHref,
  employeeSearchHref,
  quoteSearchHref,
  vendorSearchHref,
} from '@/modules/search/domain/hrefs';
import {
  GLOBAL_SEARCH_KIND_CAP,
  QUERIED_SEARCH_KINDS,
  SEARCH_KIND_PERMISSION,
  capSearchLimit,
  ilikeContainsPattern,
  kindsVisibleToPermissions,
} from '@/modules/search/domain/search-scope';

describe('global search scope', () => {
  it('queries the kinds the dialog can show, and only those', () => {
    expect(QUERIED_SEARCH_KINDS).toEqual([
      'client',
      'vendor',
      'project',
      'task',
      'billing',
      'bill',
      'quote',
      'document',
      'employee',
      'contract',
    ]);
  });

  it('drops a kind when the matching read permission is missing', () => {
    const permissions = new Set<string>([
      PERMISSIONS.CLIENTS_READ,
      PERMISSIONS.PROJECTS_READ,
      PERMISSIONS.DOCUMENTS_READ,
    ]);

    expect(kindsVisibleToPermissions(permissions)).toEqual(['client', 'project', 'document']);
    expect(kindsVisibleToPermissions(new Set())).toEqual([]);
    expect(kindsVisibleToPermissions(new Set(['not.a.permission']))).toEqual([]);
  });

  it('binds each queried kind to its catalog read key', () => {
    expect(SEARCH_KIND_PERMISSION.client).toBe(PERMISSIONS.CLIENTS_READ);
    expect(SEARCH_KIND_PERMISSION.vendor).toBe(PERMISSIONS.VENDORS_READ);
    expect(SEARCH_KIND_PERMISSION.project).toBe(PERMISSIONS.PROJECTS_READ);
    expect(SEARCH_KIND_PERMISSION.task).toBe(PERMISSIONS.TASKS_READ);
    expect(SEARCH_KIND_PERMISSION.billing).toBe(PERMISSIONS.BILLING_READ);
    expect(SEARCH_KIND_PERMISSION.bill).toBe(PERMISSIONS.AP_READ);
    expect(SEARCH_KIND_PERMISSION.quote).toBe(PERMISSIONS.QUOTES_READ);
    expect(SEARCH_KIND_PERMISSION.document).toBe(PERMISSIONS.DOCUMENTS_READ);
    expect(SEARCH_KIND_PERMISSION.employee).toBe(PERMISSIONS.WORKFORCE_READ);
    expect(SEARCH_KIND_PERMISSION.contract).toBe(PERMISSIONS.CONTRACTS_READ);
  });

  it('caps each kind at 8 and still honors a smaller caller limit', () => {
    expect(GLOBAL_SEARCH_KIND_CAP).toBe(8);
    expect(capSearchLimit(undefined)).toBe(8);
    expect(capSearchLimit(5)).toBe(5);
    expect(capSearchLimit(20)).toBe(8);
    expect(capSearchLimit(0)).toBe(1);
    expect(capSearchLimit(Number.NaN)).toBe(8);
  });

  it('escapes ILIKE wildcards so a typed percent cannot match every row', () => {
    expect(ilikeContainsPattern('acme')).toBe('%acme%');
    expect(ilikeContainsPattern('  50%_off\\  ')).toBe('%50\\%\\_off\\\\%');
    expect(ilikeContainsPattern('%')).toBe('%\\%%');
    expect(ilikeContainsPattern('%')).not.toBe('%%');
  });

  it('points new hits at the existing entity routes', () => {
    const id = '11111111-2222-4333-8444-555555555555';
    expect(clientSearchHref(id)).toBe(`/clients/${id}`);
    expect(vendorSearchHref(id)).toBe(`/vendors/${id}`);
    expect(billingRecordSearchHref(id)).toBe(`/billing/${id}`);
    expect(apBillSearchHref(id)).toBe(`/procurement/ap/${id}`);
    expect(quoteSearchHref(id)).toBe(`/quotes/${id}`);
    expect(employeeSearchHref(id)).toBe(`/workforce/employees/${id}`);
    expect(contractSearchHref(id)).toBe(`/projects/${id}?tab=contracts`);
    expect(documentSearchHref('a b%.pdf')).toBe('/documents?q=a%20b%25.pdf');
  });
});
