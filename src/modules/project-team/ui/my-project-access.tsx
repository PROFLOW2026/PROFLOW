import 'server-only';

import { getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Link } from '@/shared/i18n/navigation';
import { PROJECT_CAPABILITY_GROUPS } from '../domain/capabilities';
import { isProjectTemplateKey } from '../domain/templates';
import type { MyProjectMembership } from '../application/queries';
import { CAPABILITIES_BY_GROUP, capabilityMessageKey } from '../domain/editor';

/** "What may I do on this project" - read-only, grouped like the editor. */
export async function MyProjectAccessCard({
  capabilities,
  title,
  templateKey,
}: {
  capabilities: readonly string[];
  title: string | null;
  templateKey: string | null;
}) {
  const t = await getTranslations('projectTeam');
  const held = new Set(capabilities);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('my.accessHeading')}</CardTitle>
        <p className="text-sm text-[var(--pf-text-secondary)]">
          {[title, templateKey && isProjectTemplateKey(templateKey) ? t(`templates.${templateKey}`) : null]
            .filter(Boolean)
            .join(' · ') || t('my.accessDescription')}
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {PROJECT_CAPABILITY_GROUPS.map((group) => {
          const granted = CAPABILITIES_BY_GROUP[group].filter((capability) => held.has(capability));
          if (granted.length === 0) return null;
          return (
            <section key={group} className="flex flex-col gap-2">
              <h4 className="text-sm font-semibold">{t(`groups.${group}`)}</h4>
              <ul className="flex flex-wrap gap-1.5">
                {granted.map((capability) => (
                  <li key={capability}>
                    <Badge tone={group === 'financial' ? 'warning' : 'neutral'}>
                      {t(`capabilities.${capabilityMessageKey(capability)}`)}
                    </Badge>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </CardContent>
    </Card>
  );
}

/** Projects where the user is an active project member, with working entry links. */
export async function MyProjectMembershipsList({
  memberships,
  hrefFor,
}: {
  memberships: readonly MyProjectMembership[];
  hrefFor: (projectId: string) => string;
}) {
  if (memberships.length === 0) return null;
  const t = await getTranslations('projectTeam');
  return (
    <section className="flex flex-col gap-2" aria-labelledby="my-project-memberships-heading">
      <div className="flex flex-col gap-0.5">
        <h2 id="my-project-memberships-heading" className="text-base font-semibold">
          {t('my.heading')}
        </h2>
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('my.description')}</p>
      </div>
      <ul className="divide-y divide-[var(--pf-border-default)] overflow-hidden rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)]">
        {memberships.map((membership) => (
          <li key={membership.memberId}>
            <Link
              href={hrefFor(membership.projectId)}
              className="flex min-h-14 flex-col gap-1 px-4 py-3 hover:bg-[var(--pf-action-subtle-hover)] active:bg-[var(--pf-action-subtle-active)]"
            >
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{membership.projectName}</span>
                {membership.projectDocumentNumber ? (
                  <span className="text-xs text-[var(--pf-text-muted)]" dir="ltr">
                    {membership.projectDocumentNumber}
                  </span>
                ) : null}
              </span>
              <span className="flex flex-wrap items-center gap-1.5 text-xs text-[var(--pf-text-secondary)]">
                <span>
                  {membership.title ||
                    (membership.templateKey && isProjectTemplateKey(membership.templateKey)
                      ? t(`templates.${membership.templateKey}`)
                      : t('my.roleFallback'))}
                </span>
                <span aria-hidden>·</span>
                <span>{t('my.capabilityCount', { count: membership.capabilityCount })}</span>
                {membership.hasFinancialAccess ? (
                  <Badge tone="warning">{t('members.financialAccess')}</Badge>
                ) : null}
                {membership.canManageTeam ? <Badge tone="brand">{t('my.teamManager')}</Badge> : null}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
