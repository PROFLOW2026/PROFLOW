import { getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { Link } from '@/shared/i18n/navigation';
import { IdentityAvatar } from '@/modules/identity-images/client';
import type { UnifiedProjectTeamMember } from '@/modules/projects/domain/unified-project-team';
import type { ProjectTeamSourceTag } from '@/modules/projects/domain/unified-project-team';

export interface ProjectUnifiedTeamSummaryProps {
  readonly projectId: string;
  readonly members: readonly UnifiedProjectTeamMember[];
  readonly canManageRoster: boolean;
  readonly canOpenCapabilities: boolean;
}

function badgeLabel(
  t: Awaited<ReturnType<typeof getTranslations<'workforce'>>>,
  tag: ProjectTeamSourceTag,
): string {
  if (tag === 'roster') return t('projectPanel.badgeRoster');
  if (tag === 'capabilities') return t('projectPanel.badgeCapabilities');
  return t('projectPanel.badgeAccess');
}

export async function ProjectUnifiedTeamSummary({
  projectId,
  members,
  canManageRoster,
  canOpenCapabilities,
}: ProjectUnifiedTeamSummaryProps) {
  const t = await getTranslations('workforce');

  return (
    <section className="flex flex-col gap-3 rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-subtle)] p-4">
      <div>
        <h3 className="text-sm font-semibold text-[var(--pf-text-primary)]">
          {t('projectPanel.unifiedTitle')}
        </h3>
        {members.length === 0 ? (
          <p className="mt-1 text-sm text-[var(--pf-text-muted)]">{t('projectPanel.unifiedEmpty')}</p>
        ) : null}
      </div>
      {members.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {members.map((member) => (
            <li
              key={member.key}
              className="flex flex-wrap items-center justify-between gap-2 text-sm"
            >
              <span className="flex min-w-0 items-center gap-2 font-medium text-[var(--pf-text-primary)]">
                <IdentityAvatar
                  previewUrl={member.avatarUrl}
                  displayName={member.displayName}
                  size="sm"
                />
                <span className="min-w-0 truncate">{member.displayName}</span>
              </span>
              <span className="flex flex-wrap gap-1">
                {member.tags.map((tag) => (
                  <Badge key={tag} tone="neutral">
                    {badgeLabel(t, tag)}
                  </Badge>
                ))}
              </span>
              {canManageRoster &&
              member.employeeId &&
              !member.tags.includes('capabilities') &&
              canOpenCapabilities ? (
                <Link
                  href={`/projects/${projectId}/team?highlightEmployee=${member.employeeId}`}
                  className="text-xs font-medium text-[var(--pf-text-brand)] hover:underline"
                >
                  {t('projectPanel.addToCapabilities')}
                </Link>
              ) : null}
              {canManageRoster && member.userId && !member.tags.includes('roster') ? (
                <Link
                  href={`/projects/${projectId}/team`}
                  className="text-xs font-medium text-[var(--pf-text-brand)] hover:underline"
                >
                  {t('projectPanel.addToRoster')}
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {!canManageRoster && canOpenCapabilities ? (
        <p className="text-xs text-[var(--pf-text-muted)]">{t('projectPanel.noWorkforceAccess')}</p>
      ) : null}
    </section>
  );
}
