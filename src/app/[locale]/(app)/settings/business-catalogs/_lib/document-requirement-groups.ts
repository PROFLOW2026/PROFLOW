import {
  documentRequirementGroupKey,
  isSystemDocumentRequirement,
  localizeDocumentRequirementName,
} from '@/modules/business-catalog/domain/document-requirement-labels';
import type { DocumentRequirementView } from './types';

export interface DocumentRequirementContextRef {
  readonly contextKind: DocumentRequirementView['contextKind'];
  readonly contextKey: string | null;
  readonly rowIds: readonly string[];
}

export interface DocumentRequirementGroupView {
  readonly groupKey: string;
  readonly documentTypeKey: string;
  readonly storedLabel: string | null;
  readonly displayLabel: string;
  readonly isSystem: boolean;
  readonly required: boolean;
  readonly isActive: boolean;
  readonly contexts: readonly DocumentRequirementContextRef[];
  readonly rowIds: readonly string[];
}

export interface DocumentRequirementDuplicateReport {
  readonly canonicalIdentity: string;
  readonly contextKind: DocumentRequirementView['contextKind'];
  readonly contextKey: string | null;
  readonly documentTypeKey: string;
  readonly label: string | null;
  readonly keepId: string;
  readonly duplicateIds: readonly string[];
}

function canonicalIdentity(item: DocumentRequirementView): string {
  return [
    item.contextKind,
    item.contextKey ?? '',
    item.documentTypeKey,
    item.label?.trim() ?? '',
  ].join('|');
}

function contextIdentity(contextKind: string, contextKey: string | null): string {
  return `${contextKind}:${contextKey ?? ''}`;
}

export function findDocumentRequirementDuplicates(
  items: readonly DocumentRequirementView[],
): DocumentRequirementDuplicateReport[] {
  const byIdentity = new Map<string, DocumentRequirementView[]>();
  for (const item of items) {
    const key = canonicalIdentity(item);
    const bucket = byIdentity.get(key) ?? [];
    bucket.push(item);
    byIdentity.set(key, bucket);
  }

  const reports: DocumentRequirementDuplicateReport[] = [];
  for (const [identity, rows] of byIdentity) {
    if (rows.length <= 1) continue;
    const keep = rows[0];
    if (!keep) continue;
    const duplicates = rows.slice(1);
    reports.push({
      canonicalIdentity: identity,
      contextKind: keep.contextKind,
      contextKey: keep.contextKey,
      documentTypeKey: keep.documentTypeKey,
      label: keep.label,
      keepId: keep.id,
      duplicateIds: duplicates.map((row) => row.id),
    });
  }
  return reports;
}

export function groupDocumentRequirements(
  items: readonly DocumentRequirementView[],
  locale: string,
): DocumentRequirementGroupView[] {
  const groups = new Map<string, DocumentRequirementGroupView>();

  for (const item of items) {
    const groupKey = documentRequirementGroupKey(item.documentTypeKey, item.label);
    const isSystem = isSystemDocumentRequirement(item.documentTypeKey, item.label);
    const displayLabel = isSystem
      ? localizeDocumentRequirementName(item.documentTypeKey, item.label, locale)
      : item.label?.trim() || item.documentTypeKey;

    const existing = groups.get(groupKey);
    if (!existing) {
      groups.set(groupKey, {
        groupKey,
        documentTypeKey: item.documentTypeKey,
        storedLabel: item.label,
        displayLabel,
        isSystem,
        required: item.required,
        isActive: item.isActive,
        contexts: [
          {
            contextKind: item.contextKind,
            contextKey: item.contextKey,
            rowIds: [item.id],
          },
        ],
        rowIds: [item.id],
      });
      continue;
    }

    const contextId = contextIdentity(item.contextKind, item.contextKey);
    const contextIndex = existing.contexts.findIndex(
      (ctx) => contextIdentity(ctx.contextKind, ctx.contextKey) === contextId,
    );

    const nextContexts =
      contextIndex >= 0
        ? existing.contexts.map((ctx, index) =>
            index === contextIndex
              ? { ...ctx, rowIds: [...ctx.rowIds, item.id] }
              : ctx,
          )
        : [
            ...existing.contexts,
            {
              contextKind: item.contextKind,
              contextKey: item.contextKey,
              rowIds: [item.id],
            },
          ];

    groups.set(groupKey, {
      ...existing,
      required: existing.required || item.required,
      isActive: existing.isActive || item.isActive,
      contexts: nextContexts,
      rowIds: [...existing.rowIds, item.id],
    });
  }

  return [...groups.values()].sort((a, b) =>
    a.displayLabel.localeCompare(b.displayLabel, locale, { sensitivity: 'base' }),
  );
}
