import { getTranslations } from 'next-intl/server';
import { Link } from '@/shared/i18n/navigation';

/** Light project links into field-ops lists — avoids a full project tab. */
export async function ProjectFieldOpsLinks({ projectId }: { projectId: string }) {
  const t = await getTranslations('fieldOps.projectLinks');

  return (
    <section className="rounded-lg border border-dashed border-[var(--pf-border-default)] p-4">
      <h2 className="text-sm font-semibold">{t('title')}</h2>
      <ul className="mt-2 flex flex-wrap gap-3 text-sm">
        <li>
          <Link
            href={`/field-ops/logs?projectId=${projectId}`}
            className="text-[var(--pf-text-link)] hover:underline"
          >
            {t('logs')}
          </Link>
        </li>
        <li>
          <Link
            href={`/field-ops/punch?projectId=${projectId}`}
            className="text-[var(--pf-text-link)] hover:underline"
          >
            {t('punch')}
          </Link>
        </li>
        <li>
          <Link
            href={`/field-ops/inspections?projectId=${projectId}`}
            className="text-[var(--pf-text-link)] hover:underline"
          >
            {t('inspections')}
          </Link>
        </li>
      </ul>
    </section>
  );
}
