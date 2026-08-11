import { getTranslations } from 'next-intl/server';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { SectionNavLink } from '@/components/ui/section-nav-link';
import {
  type CreateWorkKind,
  type CreateWorkKindOption,
} from '@/components/shell/quick-create-actions';
import { Link } from '@/shared/i18n/navigation';

const TITLE_KEY = {
  project: 'create.usualKind.projectTitle',
  job: 'create.usualKind.jobTitle',
  work_order: 'create.usualKind.workOrderTitle',
} as const;

const ACTION_KEY = {
  project: 'create.usualKind.goToProject',
  job: 'create.usualKind.goToJob',
  work_order: 'create.usualKind.goToWorkOrder',
} as const;

const SWITCHER_LABEL_KEY = {
  project: 'project',
  job: 'job',
  work_order: 'service',
} as const;

/**
 * Default-only work-type hint + switcher on create screens.
 * Shared by /projects/new, /jobs/new, and /work-orders/new.
 * Never hides the current form; other types stay one tap away.
 */
export async function WorkKindCreateHint({
  current,
  defaultWorkKind,
  options,
  messagesNamespace,
}: {
  current: CreateWorkKind;
  defaultWorkKind: CreateWorkKind | null | undefined;
  options: readonly CreateWorkKindOption[];
  messagesNamespace: 'projects' | 'jobs' | 'service';
}) {
  const preferred = options.find((option) => option.kind === defaultWorkKind);
  const showBanner = Boolean(preferred && preferred.kind !== current);
  const showSwitcher = options.length > 1;
  if (!showBanner && !showSwitcher) return null;

  const t = await getTranslations(messagesNamespace);
  const tNav = await getTranslations('nav.newMenu');

  return (
    <div className="flex flex-col gap-3" data-pf-work-kind-create="">
      {showBanner && preferred ? (
        <Alert
          tone="info"
          title={t(TITLE_KEY[preferred.kind])}
          data-pf-work-kind-hint={preferred.kind}
        >
          <p className="text-[var(--pf-text-secondary)]">{t('create.usualKind.stayHint')}</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button asChild size="sm" className="w-full sm:w-auto">
              <Link href={preferred.href} prefetch={false}>
                {t(ACTION_KEY[preferred.kind])}
              </Link>
            </Button>
          </div>
        </Alert>
      ) : null}

      {showSwitcher ? (
        <nav
          aria-label={t('create.usualKind.switcherLabel')}
          className="flex min-w-0 flex-wrap items-center gap-2"
          data-pf-work-kind-switcher=""
        >
          <span className="text-xs text-[var(--pf-text-secondary)]">
            {t('create.usualKind.switcherLabel')}
          </span>
          <ul className="flex min-w-0 flex-wrap gap-1">
            {options.map((option) => (
              <li key={option.kind}>
                <SectionNavLink href={option.href} active={option.kind === current}>
                  {tNav(SWITCHER_LABEL_KEY[option.kind])}
                </SectionNavLink>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </div>
  );
}
