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

function KindRows({
  kinds,
  projectId,
}: {
  kinds: readonly ReportKind[];
  projectId: string;
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
          <ReportDownloadButtons kind={kind} id={projectId} compact />
        </div>
      ))}
    </>
  );
}

export function ReportPacksSection({
  projects,
  quotes,
  enabledKinds,
  recommendedKinds = [],
  orderedKinds,
}: {
  projects: readonly ReportPackOption[];
  quotes: readonly ReportPackOption[];
  enabledKinds: readonly ReportKind[];
  recommendedKinds?: readonly ReportKind[];
  /** When provided, “כל הדוחות” uses this order (recommended first). */
  orderedKinds?: readonly ReportKind[];
}) {
  const t = useTranslations('reports');
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '');
  const [quoteId, setQuoteId] = useState(quotes[0]?.id ?? '');
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
                      <KindRows kinds={recommendedProjectKinds} projectId={projectId} />
                    </div>
                    <div>
                      <h3 className="mt-2 text-sm font-semibold text-[var(--pf-text-primary)]">
                        {t('allPacks')}
                      </h3>
                      <KindRows
                        kinds={[...recommendedProjectKinds, ...remainingProjectKinds]}
                        projectId={projectId}
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
                    projectId={projectId}
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
    </div>
  );
}
