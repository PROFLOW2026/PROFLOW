import { Plus, ShieldCheck } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { ResponsiveTable } from '@/components/patterns/responsive-table';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  ARTIFACT_KINDS,
  ARTIFACT_STATUSES,
  SUBJECT_TYPES,
  isMissingEvidence,
  listComplianceArtifactsForOrg,
  type ArtifactKind,
  type ArtifactStatus,
  type SubjectType,
} from '@/modules/compliance';
import { complianceStatusShape, missingEvidenceShape } from '@/modules/compliance/ui';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { ComplianceListFilters } from './compliance-list-filters';
import { pressableCardLinkClassName, textNavLinkClassName } from '@/components/ui/pressable';
import { cn } from '@/shared/ui/cn';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'compliance' });
  return { title: t('title') };
}

function parseKind(value: string | undefined): ArtifactKind | 'all' {
  if (value && (ARTIFACT_KINDS as readonly string[]).includes(value)) {
    return value as ArtifactKind;
  }
  return 'all';
}

function parseStatus(value: string | undefined): ArtifactStatus | 'all' {
  if (value && (ARTIFACT_STATUSES as readonly string[]).includes(value)) {
    return value as ArtifactStatus;
  }
  return 'all';
}

function parseSubject(value: string | undefined): SubjectType | 'all' {
  if (value && (SUBJECT_TYPES as readonly string[]).includes(value)) {
    return value as SubjectType;
  }
  return 'all';
}

function parseEvidence(value: string | undefined): 'all' | 'present' | 'missing' {
  if (value === 'present' || value === 'missing') return value;
  return 'all';
}

export default async function CompliancePage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    kind?: string;
    status?: string;
    subject?: string;
    evidence?: string;
  }>;
}) {
  const t = await getTranslations('compliance');
  const tStatus = await getTranslations('status.compliance');
  const tCommon = await getTranslations('common');
  const params = await searchParams;
  const kind = parseKind(params.kind);
  const status = parseStatus(params.status);
  const subjectType = parseSubject(params.subject);
  const evidence = parseEvidence(params.evidence);
  const filtersActive = Boolean(
    params.q?.trim() ||
      kind !== 'all' ||
      status !== 'all' ||
      subjectType !== 'all' ||
      evidence !== 'all',
  );

  const { artifacts, canManage, summary } = await withOrgContext(async (context) => {
    // One capped load for both status tiles and the filtered table (avoid double fetch).
    const base = await listComplianceArtifactsForOrg(context, {
      search: params.q,
      kind,
      subjectType,
      limit: 5_000,
    });
    const filtered = base
      .filter((row) => (status === 'all' ? true : row.status === status))
      .filter((row) => {
        if (evidence === 'missing') return isMissingEvidence(row);
        if (evidence === 'present') return !isMissingEvidence(row);
        return true;
      })
      .slice(0, 200);
    return {
      artifacts: filtered,
      canManage: hasPermission(context, PERMISSIONS.COMPLIANCE_MANAGE),
      summary: {
        valid: base.filter((row) => row.status === 'valid' && !isMissingEvidence(row)).length,
        expiring: base.filter((row) => row.status === 'expiring_soon').length,
        expired: base.filter((row) => row.status === 'expired').length,
        missing: base.filter((row) => isMissingEvidence(row)).length,
      },
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          canManage ? (
            <Button asChild>
              <Link href="/compliance/new">
                <Plus aria-hidden />
                {t('newArtifact')}
              </Link>
            </Button>
          ) : null
        }
      />

      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label={t('title')}>
        {(
          [
            { key: 'valid', href: '/compliance?status=valid&evidence=present', count: summary.valid },
            {
              key: 'expiring',
              href: '/compliance?status=expiring_soon',
              count: summary.expiring,
            },
            { key: 'expired', href: '/compliance?status=expired', count: summary.expired },
            { key: 'missing', href: '/compliance?evidence=missing', count: summary.missing },
          ] as const
        ).map((item) => (
          <li key={item.key}>
            <Link
              href={item.href}
              className="flex min-h-11 items-center justify-between gap-2 rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-4 py-3 text-sm hover:bg-[var(--pf-bg-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)]"
            >
              <span>{t(`summary.${item.key}`)}</span>
              <span className="font-semibold tabular-nums" dir="ltr">
                {item.count}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <ComplianceListFilters
        initialQuery={params.q ?? ''}
        initialKind={kind}
        initialStatus={status}
        initialSubject={subjectType}
        initialEvidence={evidence}
      />

      {artifacts.length === 0 ? (
        filtersActive ? (
          <EmptyState
            title={tCommon('states.noResultsForQuery', { query: params.q?.trim() ?? '' })}
            description={tCommon('states.noResultsHint')}
            action={
              <Button asChild variant="secondary">
                <Link href="/compliance">{tCommon('actions.clearSearch')}</Link>
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={ShieldCheck}
            title={t('empty.title')}
            description={t('empty.body')}
            action={
              canManage ? (
                <Button asChild>
                  <Link href="/compliance/new">{t('empty.action')}</Link>
                </Button>
              ) : undefined
            }
          />
        )
      ) : (
        <ResponsiveTable
          items={artifacts}
          getRowKey={(artifact) => artifact.id}
          desktop={
            <div className="overflow-x-auto rounded-lg border border-[var(--pf-border-default)]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('list.columns.name')}</TableHead>
                    <TableHead>{t('list.columns.kind')}</TableHead>
                    <TableHead>{t('list.columns.subject')}</TableHead>
                    <TableHead>{t('list.columns.expiresOn')}</TableHead>
                    <TableHead>{t('list.columns.status')}</TableHead>
                    <TableHead>{t('list.columns.evidence')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {artifacts.map((artifact) => (
                    <TableRow key={artifact.id}>
                      <TableCell>
                        <Link
                          href={`/compliance/${artifact.id}`}
                          className={cn(textNavLinkClassName, 'font-medium')}
                        >
                          {artifact.name}
                        </Link>
                      </TableCell>
                      <TableCell>{t(`kinds.${artifact.artifactKind}`)}</TableCell>
                      <TableCell>{t(`subjects.${artifact.subjectType}`)}</TableCell>
                      <TableCell>
                        {artifact.expiresOn ? (
                          <span className="pf-ltr-island" dir="ltr">
                            {artifact.expiresOn}
                          </span>
                        ) : (
                          t('list.noExpiry')
                        )}
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          shape={complianceStatusShape(artifact.status)}
                          label={tStatus(artifact.status)}
                        />
                      </TableCell>
                      <TableCell>
                        {isMissingEvidence(artifact) ? (
                          <StatusBadge
                            shape={missingEvidenceShape()}
                            label={t('list.evidenceMissing')}
                          />
                        ) : (
                          <span className="text-sm text-[var(--pf-text-secondary)]">
                            {t('list.evidencePresent')}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          }
          renderMobileCard={(artifact) => (
            <Link
              href={`/compliance/${artifact.id}`}
              className={pressableCardLinkClassName}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0 flex-1 font-semibold">{artifact.name}</span>
                <StatusBadge
                  shape={complianceStatusShape(artifact.status)}
                  label={tStatus(artifact.status)}
                />
              </div>
              <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">
                {t(`kinds.${artifact.artifactKind}`)} · {t(`subjects.${artifact.subjectType}`)}
                {artifact.expiresOn ? (
                  <>
                    {' · '}
                    <span className="pf-ltr-island" dir="ltr">
                      {artifact.expiresOn}
                    </span>
                  </>
                ) : null}
              </p>
              {isMissingEvidence(artifact) ? (
                <p className="mt-2">
                  <StatusBadge
                    shape={missingEvidenceShape()}
                    label={t('list.evidenceMissing')}
                  />
                </p>
              ) : null}
            </Link>
          )}
        />
      )}
    </div>
  );
}
