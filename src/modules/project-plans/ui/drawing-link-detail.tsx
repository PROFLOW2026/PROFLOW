import { Link } from '@/shared/i18n/navigation';
import type { ResolvedDrawingLink } from '../domain/drawing-picker';

export function DrawingLinkDetail({
  labels,
  drawingId,
  drawingRevisionId,
  drawingReference,
  resolved,
  planHref,
}: {
  labels: {
    readonly link: string;
    readonly reference: string;
    readonly empty: string;
    readonly openPlan: string;
  };
  drawingId: string | null;
  drawingRevisionId: string | null;
  drawingReference: string | null;
  resolved: ResolvedDrawingLink | null;
  planHref?: string | null;
}) {
  const hasStructuredLink = Boolean(drawingId && resolved);
  const hasReference = Boolean(drawingReference?.trim());
  if (!hasStructuredLink && !hasReference) {
    return <p className="text-sm text-[var(--pf-text-secondary)]">{labels.empty}</p>;
  }

  return (
    <div className="flex flex-col gap-2 text-sm">
      {hasStructuredLink && resolved ? (
        <div>
          <span className="text-[var(--pf-text-secondary)]">{labels.link}: </span>
          {planHref ? (
            <Link href={planHref} className="font-medium text-[var(--pf-text-brand)] hover:underline">
              {resolved.drawingNumber} · {resolved.title}
            </Link>
          ) : (
            <span>
              {resolved.drawingNumber} · {resolved.title}
            </span>
          )}
          {resolved.revisionLabel ? (
            <span className="text-[var(--pf-text-secondary)]">{` · ${resolved.revisionLabel}`}</span>
          ) : drawingRevisionId ? (
            <span className="text-[var(--pf-text-secondary)]">{` · ${labels.reference}`}</span>
          ) : null}
        </div>
      ) : null}
      {hasReference ? (
        <div>
          <span className="text-[var(--pf-text-secondary)]">{labels.reference}: </span>
          {drawingReference}
        </div>
      ) : null}
      {hasStructuredLink && planHref ? (
        <Link href={planHref} className="text-xs font-medium text-[var(--pf-text-brand)] hover:underline">
          {labels.openPlan}
        </Link>
      ) : null}
    </div>
  );
}
