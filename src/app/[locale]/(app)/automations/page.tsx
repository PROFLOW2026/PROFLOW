import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Workflow } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { Alert } from '@/components/ui/alert';
import { listAutomationPresets } from '@/modules/automations';
import { getShellContext, withOrgContext } from '@/shared/auth/session';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { runNowAction, toggleAutomationAction } from './actions';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'automations' });
  return { title: t('title') };
}

export default async function AutomationsPage() {
  const t = await getTranslations('automations');
  const shell = await getShellContext();
  if (!shell?.permissions.has(PERMISSIONS.AUTOMATIONS_READ)) {
    return (
      <EmptyState icon={Workflow} title={t('notAllowed.title')} description={t('notAllowed.body')} />
    );
  }
  const canManage = shell.permissions.has(PERMISSIONS.AUTOMATIONS_MANAGE);
  const data = await withOrgContext(async (context) => {
    try {
      return await listAutomationPresets(context);
    } catch {
      return { presets: [], runs: [] };
    }
  });

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader title={t('title')} description={t('description')} />
      <Alert tone="info">{t('safeNote')}</Alert>
      {data.presets.length === 0 ? (
        <EmptyState icon={Workflow} title={t('empty.title')} description={t('empty.body')} />
      ) : (
        <ul className="flex flex-col gap-3">
          {data.presets.map((preset) => (
            <li
              key={preset.presetKey}
              className="flex flex-col gap-2 rounded-lg border border-[var(--pf-border-default)] p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-medium">{t(`presets.${preset.presetKey}.name`)}</p>
                <p className="text-sm text-[var(--pf-text-secondary)]">
                  {t(`presets.${preset.presetKey}.hint`)}
                </p>
              </div>
              {canManage ? (
                <div className="flex flex-wrap gap-2">
                  <form action={toggleAutomationAction}>
                    <input type="hidden" name="presetKey" value={preset.presetKey} />
                    <input type="hidden" name="enabled" value={preset.enabled ? 'false' : 'true'} />
                    <Button type="submit" variant="secondary" size="sm">
                      {preset.enabled ? t('actions.disable') : t('actions.enable')}
                    </Button>
                  </form>
                  <form action={runNowAction}>
                    <input type="hidden" name="presetKey" value={preset.presetKey} />
                    <Button type="submit" size="sm">
                      {t('actions.runNow')}
                    </Button>
                  </form>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">{t('history.title')}</h2>
        {data.runs.length === 0 ? (
          <p className="text-sm text-[var(--pf-text-secondary)]">{t('history.empty')}</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {data.runs.map((run) => (
              <li key={run.id}>
                {t(`history.${run.status}`)}
                {run.errorMessage ? ` — ${run.errorMessage}` : ''}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
