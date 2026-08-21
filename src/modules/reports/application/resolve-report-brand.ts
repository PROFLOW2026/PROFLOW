import 'server-only';

import {
  minimalBrandContext,
  resolveDocumentBrand,
  type CaptureBrandSnapshotInput,
  type DocumentBrandContext,
} from '@/modules/branding';
import type { OrgContext } from '@/shared/auth/context';
import { reportDirection } from '../domain/copy';
import { reportBrandTheme } from '../domain/report-brand-theme';
import type { ReportKind } from '../domain/types';

export async function resolveReportBrand(
  context: OrgContext,
  input: {
    readonly kind: ReportKind;
    readonly locale: string;
    readonly entityType?: CaptureBrandSnapshotInput['entityType'] | 'report';
    readonly entityId?: string;
    readonly projectId?: string | null;
    readonly brandProfileId?: string | null;
    readonly preferSnapshot?: boolean;
  },
): Promise<DocumentBrandContext> {
  const theme = reportBrandTheme(input.kind);
  const dir = reportDirection(input.locale);
  try {
    const resolved = await resolveDocumentBrand(context, {
      theme,
      locale: input.locale,
      dir,
      entityType: input.entityType,
      entityId: input.entityId,
      projectId: input.projectId,
      brandProfileId: input.brandProfileId,
      useSnapshotIfPresent: input.preferSnapshot !== false,
    });
    return { ...resolved.context, theme };
  } catch {
    return minimalBrandContext(context.organization.name, input.locale, dir, theme);
  }
}
