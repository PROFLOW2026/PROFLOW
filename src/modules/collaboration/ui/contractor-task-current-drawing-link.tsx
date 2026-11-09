import { FileImage } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/shared/i18n/navigation';
import type { ContractorPortalTaskDrawingLink } from '../application/contractor-portal-task-drawing';

export async function ContractorTaskCurrentDrawingLink({
  projectId,
  drawing,
}: {
  readonly projectId: string;
  readonly drawing: ContractorPortalTaskDrawingLink;
}) {
  const t = await getTranslations('collaboration');
  return (
    <Link
      id="contractor-task-drawing"
      href={`/contractor/projects/${projectId}/plans/${drawing.drawingId}`}
      className="inline-flex min-h-11 w-fit items-center gap-2 rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface,white)] px-4 text-sm font-medium text-[var(--pf-text-primary)] hover:bg-[var(--pf-bg-muted)]"
      data-testid="contractor-task-drawing-link"
    >
      <FileImage className="size-4" aria-hidden />
      <span>{t('portal.tasks.currentDrawing', { label: drawing.label })}</span>
    </Link>
  );
}
