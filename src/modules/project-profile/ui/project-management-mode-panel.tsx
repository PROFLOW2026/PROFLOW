import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  findProjectDeliveryProfile,
  loadStructurePermissions,
  MANAGEMENT_MODES,
  resolveManagementMode,
} from '@/modules/project-profile';
import { withOrgContext } from '@/shared/auth/session';
import { saveProjectManagementModeAction } from './management-mode-actions';

/** Project edit asks for one management mode. Saving it does not create an Owner membership. */
export async function ProjectManagementModePanel({ projectId }: { readonly projectId: string }) {
  const t = await getTranslations('projects');
  const view = await withOrgContext(async (context) => {
    const [profile, permissions] = await Promise.all([
      findProjectDeliveryProfile(context, projectId),
      loadStructurePermissions(context, projectId),
    ]);
    return { mode: resolveManagementMode(profile), canEdit: permissions.canManageSettings };
  });

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle>{t('create.managementModeLabel')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={saveProjectManagementModeAction} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <input type="hidden" name="projectId" value={projectId} />
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
            <span className="text-[var(--pf-text-secondary)]">{t('create.managementModeHint')}</span>
            <select
              name="managementMode"
              defaultValue={view.mode}
              disabled={!view.canEdit}
              className="min-h-11 rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-3"
            >
              {MANAGEMENT_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {t(`create.managementModes.${mode}`)}
                </option>
              ))}
            </select>
          </label>
          {view.canEdit ? <Button type="submit">{t('create.managementModeSave')}</Button> : null}
        </form>
      </CardContent>
    </Card>
  );
}
