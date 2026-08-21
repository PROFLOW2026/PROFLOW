'use client';

import { useActionState, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  PROJECT_ACCESS_LEVELS,
  PROJECT_ACCESS_MODES,
  type ProjectAccessLevel,
  type ProjectAccessMode,
} from '@/modules/projects/domain/project-access';
import type { SettingsActionState } from '@/app/[locale]/(app)/settings/actions';
import {
  grantProjectAccessAction,
  revokeProjectAccessAction,
  saveProjectAccessModeAction,
} from '@/app/[locale]/(app)/settings/people/project-access-actions';

export function ProjectScopedAccessPanel({
  projectId,
  mode,
  canManage,
  members,
  grants,
}: {
  projectId: string;
  mode: ProjectAccessMode;
  canManage: boolean;
  members: { userId: string; email: string; displayName: string | null }[];
  grants: { id: string; userId: string; projectId: string; accessLevel: ProjectAccessLevel }[];
}) {
  const t = useTranslations('settings.people');
  const tProjects = useTranslations('projects.access');
  const router = useRouter();
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const [modeState, modeAction, modePending] = useActionState(
    saveProjectAccessModeAction,
    {} as SettingsActionState,
  );
  const [grantState, grantAction, grantPending] = useActionState(
    grantProjectAccessAction,
    {} as SettingsActionState,
  );
  const [accessLevel, setAccessLevel] = useState<ProjectAccessLevel>('read');

  const memberName = (userId: string) => {
    const member = members.find((item) => item.userId === userId);
    return member?.displayName || member?.email || userId;
  };

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-[var(--pf-border-default)] p-4 sm:p-6">
      <div>
        <h2 className="text-base font-semibold">{tProjects('title')}</h2>
        <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">{tProjects('hint')}</p>
        <p className="mt-2 text-sm text-[var(--pf-text-secondary)]">{t('assignedModeHint')}</p>
      </div>

      {canManage ? (
        <form action={modeAction} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field label={t('accessMode')} className="min-w-0 flex-1">
            {(control) => (
              <Select name="mode" defaultValue={mode}>
                <SelectTrigger id={control.id}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROJECT_ACCESS_MODES.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item === 'all'
                        ? t('modeAll')
                        : item === 'selected'
                          ? t('modeSelected')
                          : t('modeAssigned')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>
          <Button type="submit" variant="secondary" loading={modePending}>
            {t('saveMode')}
          </Button>
        </form>
      ) : (
        <p className="text-sm">
          {mode === 'all' ? t('modeAll') : mode === 'selected' ? t('modeSelected') : t('modeAssigned')}
        </p>
      )}

      {modeState.error ? <Alert tone="danger">{modeState.error}</Alert> : null}
      <p className="text-xs text-[var(--pf-text-muted)]">{tProjects('modeOrgWide')}</p>

      {canManage && mode !== 'all' ? (
        <form action={grantAction} className="grid gap-3 sm:grid-cols-3 sm:items-end">
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="accessLevel" value={accessLevel} />
          <Field label={t('grantUser')}>
            {(control) => (
              <Select name="userId">
                <SelectTrigger id={control.id}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {members.map((member) => (
                    <SelectItem key={member.userId} value={member.userId}>
                      {member.displayName || member.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>
          <Field label={tProjects('accessLevel')}>
            {(control) => (
              <Select
                value={accessLevel}
                onValueChange={(value) => setAccessLevel(value as ProjectAccessLevel)}
              >
                <SelectTrigger id={control.id}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROJECT_ACCESS_LEVELS.map((level) => (
                    <SelectItem key={level} value={level}>
                      {tProjects(`levels.${level}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>
          <Button type="submit" loading={grantPending}>
            {t('grantAdd')}
          </Button>
        </form>
      ) : null}

      {grantState.error ? <Alert tone="danger">{grantState.error}</Alert> : null}
      {revokeError ? <Alert tone="danger">{revokeError}</Alert> : null}

      {grants.length === 0 ? (
        <p className="text-sm text-[var(--pf-text-muted)]">{t('grantEmpty')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {grants.map((grant) => (
            <li
              key={grant.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--pf-border-default)] px-3 py-2 text-sm"
            >
              <span>
                {memberName(grant.userId)} · {tProjects(`levels.${grant.accessLevel}`)}
              </span>
              {canManage ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    void (async () => {
                      const result = await revokeProjectAccessAction(grant.id);
                      if (result.error) {
                        setRevokeError(result.error);
                        return;
                      }
                      setRevokeError(null);
                      router.refresh();
                    })();
                  }}
                >
                  {t('revoke')}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
