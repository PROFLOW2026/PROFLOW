'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ReportKind, ReportPackOption } from '../domain/types';
import { ReportDownloadButtons } from './report-download-buttons';

export type { ReportPackOption };

const PROJECT_KINDS: readonly ReportKind[] = [
  'project_status',
  'project_financial_summary',
  'boq_progress',
  'change_order_summary',
  'punch_inspection',
  'vendor_subcontract_summary',
];

const CLIENT_KINDS: readonly ReportKind[] = ['client_360'];
const VENDOR_KINDS: readonly ReportKind[] = ['vendor_360', 'subcontract_cash'];
const ORG_KINDS: readonly ReportKind[] = [
  'contract_portfolio',
  'labor_utilization',
  'retention_schedule',
  'inventory_movement',
  'compliance_expiry',
  'crm_funnel',
  'month_close_completeness',
  'safety_open_actions',
];

function KindRows({
  kinds,
  entityId,
}: {
  kinds: readonly ReportKind[];
  entityId: string;
}) {
  const t = useTranslations('reports');
  return (
    <>
      {kinds.map((kind) => (
        <div
          key={kind}
          className="flex flex-col gap-2 border-t border-[var(--pf-border-default)] pt-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <p className="font-medium">{t(`kinds.${kind}`)}</p>
            <p className="text-sm text-[var(--pf-text-secondary)]">{t(`kindHints.${kind}`)}</p>
          </div>
          <ReportDownloadButtons kind={kind} id={entityId} compact />
        </div>
      ))}
    </>
  );
}

export function ReportPacksSection({
  projects,
  quotes,
  clients = [],
  vendors = [],
  organizationId,
  enabledKinds,
  recommendedKinds = [],
  orderedKinds,
}: {
  projects: readonly ReportPackOption[];
  quotes: readonly ReportPackOption[];
  clients?: readonly ReportPackOption[];
  vendors?: readonly ReportPackOption[];
  organizationId?: string;
  enabledKinds: readonly ReportKind[];
  recommendedKinds?: readonly ReportKind[];
  /** When provided, “כל הדוחות” uses this order (recommended first). */
  orderedKinds?: readonly ReportKind[];
}) {
  const t = useTranslations('reports');
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '');
  const [quoteId, setQuoteId] = useState(quotes[0]?.id ?? '');
  const [clientId, setClientId] = useState(clients[0]?.id ?? '');
  const [vendorId, setVendorId] = useState(vendors[0]?.id ?? '');
  const enabled = useMemo(() => new Set(enabledKinds), [enabledKinds]);

  const allProjectKinds = useMemo(() => {
    const source = orderedKinds ?? enabledKinds;
    return source.filter(
      (kind) => PROJECT_KINDS.includes(kind) && enabled.has(kind),
    );
  }, [orderedKinds, enabledKinds, enabled]);

  const recommendedProjectKinds = useMemo(
    () =>
      recommendedKinds.filter(
        (kind) => PROJECT_KINDS.includes(kind) && enabled.has(kind),
      ),
    [recommendedKinds, enabled],
  );

  const remainingProjectKinds = useMemo(() => {
    const recommendedSet = new Set(recommendedProjectKinds);
    return allProjectKinds.filter((kind) => !recommendedSet.has(kind));
  }, [allProjectKinds, recommendedProjectKinds]);

  const showSplit =
    recommendedProjectKinds.length > 0 && remainingProjectKinds.length > 0;

  const clientKinds = useMemo(
    () => (orderedKinds ?? enabledKinds).filter((kind) => CLIENT_KINDS.includes(kind) && enabled.has(kind)),
    [orderedKinds, enabledKinds, enabled],
  );
  const vendorKinds = useMemo(
    () => (orderedKinds ?? enabledKinds).filter((kind) => VENDOR_KINDS.includes(kind) && enabled.has(kind)),
    [orderedKinds, enabledKinds, enabled],
  );
  const orgKinds = useMemo(
    () => (orderedKinds ?? enabledKinds).filter((kind) => ORG_KINDS.includes(kind) && enabled.has(kind)),
    [orderedKinds, enabledKinds, enabled],
  );

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-[var(--pf-text-secondary)]">{t('csvStillHere')}</p>

      <Card>
        <CardHeader>
          <CardTitle>{t('packsHeading')}</CardTitle>
          <CardDescription>{t('description')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {projects.length === 0 ? (
            <p className="text-sm text-[var(--pf-text-secondary)]">{t('noProjects')}</p>
          ) : (
            <>
              <Field label={t('selectProject')}>
                {(control) => (
                  <>
                    <Select value={projectId} onValueChange={setProjectId}>
                      <SelectTrigger id={control.id}>
                        <SelectValue placeholder={t('chooseProject')} />
                      </SelectTrigger>
                      <SelectContent>
                        {projects.map((project) => (
                          <SelectItem key={project.id} value={project.id}>
                            {project.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </>
                )}
              </Field>
              {projectId ? (
                showSplit ? (
                  <>
                    <div>
                      <h3 className="text-sm font-semibold text-[var(--pf-text-primary)]">
                        {t('recommendedPacks')}
                      </h3>
                      <KindRows kinds={recommendedProjectKinds} entityId={projectId} />
                    </div>
                    <div>
                      <h3 className="mt-2 text-sm font-semibold text-[var(--pf-text-primary)]">
                        {t('allPacks')}
                      </h3>
                      <KindRows
                        kinds={[...recommendedProjectKinds, ...remainingProjectKinds]}
                        entityId={projectId}
                      />
                    </div>
                  </>
                ) : (
                  <KindRows
                    kinds={
                      recommendedProjectKinds.length > 0
                        ? recommendedProjectKinds
                        : allProjectKinds
                    }
                    entityId={projectId}
                  />
                )
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

      {enabled.has('quote_estimate') && quotes.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('quotePacksHeading')}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Field label={t('selectQuote')}>
              {(control) => (
                <>
                  <Select value={quoteId} onValueChange={setQuoteId}>
                    <SelectTrigger id={control.id}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {quotes.map((quote) => (
                        <SelectItem key={quote.id} value={quote.id}>
                          {quote.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </>
              )}
            </Field>
            {quoteId ? <ReportDownloadButtons kind="quote_estimate" id={quoteId} /> : null}
          </CardContent>
        </Card>
      ) : null}

      {clientKinds.length > 0 && clients.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('kinds.client_360')}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Field label={t('identity.client')}>
              {(control) => (
                <Select value={clientId} onValueChange={setClientId}>
                  <SelectTrigger id={control.id}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map((client) => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>
            {clientId ? <KindRows kinds={clientKinds} entityId={clientId} /> : null}
          </CardContent>
        </Card>
      ) : null}

      {vendorKinds.length > 0 && vendors.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('kinds.vendor_360')}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Field label="Vendor">
              {(control) => (
                <Select value={vendorId} onValueChange={setVendorId}>
                  <SelectTrigger id={control.id}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {vendors.map((vendor) => (
                      <SelectItem key={vendor.id} value={vendor.id}>
                        {vendor.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>
            {vendorId ? <KindRows kinds={vendorKinds} entityId={vendorId} /> : null}
          </CardContent>
        </Card>
      ) : null}

      {orgKinds.length > 0 && organizationId ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('allPacks')}</CardTitle>
          </CardHeader>
          <CardContent>
            <KindRows kinds={orgKinds} entityId={organizationId} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
