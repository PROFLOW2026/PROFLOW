import { productQuoteDetailHref, PRODUCT_QUOTE_PATH } from '@/modules/quotes/domain/product-path';

export type CrmUiSurface = 'owner' | 'employee';

export function crmHubHref(surface: CrmUiSurface): string {
  return surface === 'employee' ? '/employee/crm' : '/crm';
}

export function crmOpportunityHref(surface: CrmUiSurface, opportunityId: string): string {
  return `${crmHubHref(surface)}/opportunities/${opportunityId}`;
}

export function crmOpportunityNewHref(surface: CrmUiSurface): string {
  return `${crmHubHref(surface)}/opportunities/new`;
}

export function crmQuotesRouteBase(surface: CrmUiSurface): string {
  return surface === 'employee' ? '/employee/quotes' : PRODUCT_QUOTE_PATH;
}

export function crmProjectHref(surface: CrmUiSurface, projectId: string): string {
  return surface === 'employee' ? `/employee/projects/${projectId}` : `/projects/${projectId}`;
}

export function crmClientHref(surface: CrmUiSurface, clientId: string): string {
  return surface === 'employee' ? `/employee/clients/${clientId}` : `/clients/${clientId}`;
}

export function crmQuoteCreateHref(surface: CrmUiSurface, opportunityId?: string | null): string {
  const base = crmQuotesRouteBase(surface);
  if (!opportunityId) return `${base}/new`;
  return `${base}/new?opportunityId=${encodeURIComponent(opportunityId)}`;
}

export function crmQuoteDetailHref(surface: CrmUiSurface, quoteId: string): string {
  if (surface === 'employee') {
    return `${crmQuotesRouteBase(surface)}/${quoteId}`;
  }
  return productQuoteDetailHref(quoteId);
}
