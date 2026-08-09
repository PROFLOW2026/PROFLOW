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
  listComplianceArtifactsForOrg,
  type ArtifactKind,
  type ArtifactStatus,
  type SubjectType,
} from '@/modules/compliance';
import { complianceStatusShape } from '@/modules/compliance/ui';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { ComplianceListFilters } from './compliance-list-filters';

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

export default async function CompliancePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; kind?: string; status?: string; subject?: string }>;
}) {
  const t = await getTranslations('compliance');
  const tStatus = await getTranslations('status.compliance');
  const tCommon = await getTranslations('common');
  const params = await searchParams;
  const kind = parseKind(params.kind);
  const status = parseStatus(params.status);
  const subjectType = parseSubject(params.subject);
  const filtersActive = Boolean(
    params.q?.trim() || kind !== 'all' || status !== 'all' || subjectType !== 'all',
  );

  const { artifacts, canManage } = await withOrgContext(async (context) => ({
    artifacts: await listComplianceArtifactsForOrg(context, {
      search: params.q,
      kind,
      status,
      subjectType,
    }),
    canManage: hasPermission(context, PERMISSIONS.COMPLIANCE_MANAGE),
  }));

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

      <ComplianceListFilters
        initialQuery={params.q ?? ''}
        initialKind={kind}
        initialStatus={status}
        initialSubject={subjectType}
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
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {artifacts.map((artifact) => (
                    <TableRow key={artifact.id}>
                      <TableCell>
                        <Link
                          href={`/compliance/${artifact.id}`}
                          className="font-medium hover:underline"
                        >
                          {artifact.name}
                        </Link>
                      </TableCell>
                      <TableCell>{t(`kinds.${artifact.artifactKind}`)}</TableCell>
                      <TableCell>{t(`subjects.${artifact.subjectType}`)}</TableCell>
                      <TableCell>{artifact.expiresOn ?? t('list.noExpiry')}</TableCell>
                      <TableCell>
                        <StatusBadge
                          shape={complianceStatusShape(artifact.status)}
                          label={tStatus(artifact.status)}
                        />
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
              className="block min-h-11 rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-semibold">{artifact.name}</span>
                <StatusBadge
                  shape={complianceStatusShape(artifact.status)}
                  label={tStatus(artifact.status)}
                />
              </div>
              <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">
                {t(`kinds.${artifact.artifactKind}`)} · {t(`subjects.${artifact.subjectType}`)}
                {artifact.expiresOn ? ` · ${artifact.expiresOn}` : ''}
              </p>
            </Link>
          )}
        />
      )}
    </div>
  );
}
