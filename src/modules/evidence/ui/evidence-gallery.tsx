import { getFormatter, getTranslations } from 'next-intl/server';
import { requireExternalContext } from '@/modules/contractor-access';
import { withOrgContext } from '@/shared/auth/session';
import {
  loadExternalEvidenceGallery,
  loadInternalEvidenceGallery,
} from '@/modules/evidence';
import {
  EXTERNAL_EVIDENCE_DOWNLOAD_PATH,
  INTERNAL_EVIDENCE_DOWNLOAD_PATH,
} from '@/modules/evidence/routes';
import type { EvidenceGalleryProps } from './types';

function downloadHref(viewer: EvidenceGalleryProps['viewer'], evidenceId: string | undefined): string | null {
  if (!evidenceId) return null;
  const base = viewer === 'internal' ? INTERNAL_EVIDENCE_DOWNLOAD_PATH : EXTERNAL_EVIDENCE_DOWNLOAD_PATH;
  return `${base}/${evidenceId}`;
}

export async function EvidenceGallery(props: EvidenceGalleryProps) {
  const t = await getTranslations('projectPlans.evidence.gallery');
  const format = await getFormatter();
  const data =
    props.viewer === 'internal'
      ? await withOrgContext((context) =>
          loadInternalEvidenceGallery(context, { entityType: props.entityType, entityId: props.entityId }),
        )
      : await (async () => {
          const context = await requireExternalContext();
          return loadExternalEvidenceGallery(context, {
            organizationId: props.organizationId,
            entityType: props.entityType,
            entityId: props.entityId,
          });
        })();

  if (data.items.length === 0) {
    return <p className="text-sm text-[var(--pf-text-secondary)]">{t('empty')}</p>;
  }

  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {data.items.map((item) => {
        const href = downloadHref(props.viewer, item.evidenceId);
        const uploaded = format.dateTime(new Date(item.uploadedAt), { dateStyle: 'medium', timeStyle: 'short' });
        const label = item.caption?.trim() || item.fileName;
        return (
          <li key={item.evidenceId ?? item.documentId} className="flex min-w-0 flex-col gap-1 rounded-lg border border-[var(--pf-border-default)] p-2">
            {href ? (
              <a href={href} className="truncate text-sm font-medium text-[var(--pf-text-brand)] hover:underline" target="_blank" rel="noopener noreferrer">
                {label}
              </a>
            ) : (
              <span className="truncate text-sm font-medium">{label}</span>
            )}
            <span className="text-xs text-[var(--pf-text-muted)]">
              {t(`kind.${item.kind}`)} · {uploaded}
            </span>
            {item.uploader.displayName ? (
              <span className="text-xs text-[var(--pf-text-secondary)]">{item.uploader.displayName}</span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
