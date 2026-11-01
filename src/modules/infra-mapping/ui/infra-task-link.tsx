import { Camera } from 'lucide-react';
import { Link } from '@/shared/i18n/navigation';
import { INFRA_TEXT } from './texts';

/**
 * Entry point from an existing task (main, employee and contractor apps) into the infrastructure
 * workspace; the task id travels in the query so every capture made there is linked to the task.
 * No new task system: the link only adds the existing task as context.
 */
export function InfraTaskLink({ href }: { readonly href: string }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-11 w-fit items-center gap-2 rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface,white)] px-4 text-sm font-medium text-[var(--pf-text-primary)] hover:bg-[var(--pf-bg-muted)]"
      data-testid="infra-task-link"
    >
      <Camera className="size-4" aria-hidden />
      {INFRA_TEXT.taskEntry}
    </Link>
  );
}
