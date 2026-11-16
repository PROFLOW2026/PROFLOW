import { getTranslations } from 'next-intl/server';
import { Link } from '@/shared/i18n/navigation';
import { titleWithDocumentNumber } from '@/modules/tenancy/domain/document-numbers';

/** Compact project identity for task-work and execution workspaces (no commercial metrics). */
export async function ProjectOperationalContextHeader({
  projectName,
  documentNumber,
  backToProjectHref,
  workspaceKind,
  compact = false,
}: {
  readonly projectName: string;
  readonly documentNumber: string;
  readonly backToProjectHref: string;
  readonly workspaceKind: 'work' | 'execution' | 'takeoff';
  /** Takeoff only: one line, so the plan keeps the height. */
  readonly compact?: boolean;
}) {
  const tWork = await getTranslations('tasks');
  const tPw = await getTranslations('projectWorkspace');
  const subtitle =
    workspaceKind === 'work'
      ? tWork('projectWork.identityTitle')
      : workspaceKind === 'execution'
        ? tPw('execution.identityTitle')
        : tPw('takeoff.identityTitle');

  return (
    <header className={compact ? 'flex min-w-0 items-center justify-between gap-2' : 'flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'}>
      <div className="min-w-0">
        <h1 className={compact ? 'truncate text-sm font-semibold text-[var(--pf-text-primary)]' : 'truncate text-lg font-semibold text-[var(--pf-text-primary)]'}>
          {titleWithDocumentNumber(projectName, documentNumber)}
        </h1>
        {compact ? null : <p className="text-sm text-[var(--pf-text-secondary)]">{subtitle}</p>}
      </div>
      <Link
        href={backToProjectHref}
        className={
          compact
            ? 'inline-flex min-h-9 shrink-0 items-center text-sm font-medium text-[var(--pf-text-brand)] hover:underline'
            : 'inline-flex min-h-11 shrink-0 items-center rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-3 text-sm font-medium text-[var(--pf-text-brand)] hover:bg-[var(--pf-action-subtle-hover)]'
        }
      >
        {tWork('projectWork.backToProject')}
      </Link>
    </header>
  );
}
