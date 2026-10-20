'use client';

import { useActionState, useState } from 'react';
import { useRouter } from '@/shared/i18n/navigation';
import { useTranslations } from 'next-intl';
import { MainAppFormGrid, MainAppSection, mainAppFieldSpan } from '@/components/patterns/main-app';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { employeeUsernameFromAuthEmail } from '@/modules/employee-app/domain/username';
import { PROJECT_ACCESS_MODES, type ProjectAccessMode } from '@/modules/projects/domain/project-access';
import type { SettingsActionState } from '../actions';
import {
  grantProjectAccessAction,
  revokeProjectAccessAction,
  saveProjectAccessModeAction,
} from './project-access-actions';

export function ProjectAccessPanel({
  mode,
  canManage,
  members,
  projects,
  grants,
  accessAllMembers,
}: {
  mode: ProjectAccessMode;
  canManage: boolean;
  members: { userId: string; email: string; displayName: string | null }[];
  projects: { id: string; name: string }[];
  grants: { id: string; userId: string; projectId: string; accessLevel?: 'read' | 'manage' }[];
  accessAllMembers: { userId: string; email: string; displayName: string | null }[];
}) {
  const t = useTranslations('settings.people');
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

  const memberName = (userId: string) => {
    const member = members.find((item) => item.userId === userId);
    if (!member) return userId;
    return member.displayName || employeeUsernameFromAuthEmail(member.email) || member.email;
  };
  const projectName = (projectId: string) =>
    projects.find((item) => item.id === projectId)?.name ?? projectId;

  return (
    <MainAppSection title={t('accessTitle')} description={t('accessHint')}>
      <p className="text-sm text-[var(--pf-text-secondary)]">{t('assignedModeHint')}</p>

      {mode !== 'all' && accessAllMembers.length > 0 ? (
        <Alert tone="warning">
          {t('accessAllBypassWarning', {
            names: accessAllMembers
              .map((member) => member.displayName || employeeUsernameFromAuthEmail(member.email) || member.email)
              .join(', '),
          })}
        </Alert>
      ) : null}

      {canManage ? (
        <form action={modeAction} className="w-full min-w-0">
          <MainAppFormGrid dense className="gap-4 sm:items-end">
            <Field label={t('accessMode')} className={mainAppFieldSpan.lg}>
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
            <div className={mainAppFieldSpan.md}>
              <Button type="submit" variant="secondary" loading={modePending}>
                {t('saveMode')}
              </Button>
            </div>
          </MainAppFormGrid>
        </form>
      ) : (
        <p className="text-sm">{mode === 'all' ? t('modeAll') : mode === 'selected' ? t('modeSelected') : t('modeAssigned')}</p>
      )}

      {modeState.error ? <Alert tone="danger">{modeState.error}</Alert> : null}

      {canManage && mode !== 'all' ? (
        <form action={grantAction} className="w-full min-w-0">
          <MainAppFormGrid dense className="gap-4 sm:items-end">
            <Field label={t('grantUser')} className={mainAppFieldSpan.lg}>
              {(control) => (
                <Select name="userId">
                  <SelectTrigger id={control.id}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {members.map((member) => (
                      <SelectItem key={member.userId} value={member.userId}>
                        {member.displayName || employeeUsernameFromAuthEmail(member.email) || member.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>
            <Field label={t('grantProject')} className={mainAppFieldSpan.lg}>
              {(control) => (
                <Select name="projectId">
                  <SelectTrigger id={control.id}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>
            <Field label={t('grantLevel')} className={mainAppFieldSpan.md}>
              {(control) => (
                <Select name="accessLevel" defaultValue="read">
                  <SelectTrigger id={control.id}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="read">{t('levelRead')}</SelectItem>
                    <SelectItem value="manage">{t('levelManage')}</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </Field>
            <div className={mainAppFieldSpan.md}>
              <Button type="submit" loading={grantPending}>
                {t('grantAdd')}
              </Button>
            </div>
          </MainAppFormGrid>
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
                {memberName(grant.userId)} · {projectName(grant.projectId)}
                {' · '}
                {grant.accessLevel === 'manage' ? t('levelManage') : t('levelRead')}
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
    </MainAppSection>
  );
}
