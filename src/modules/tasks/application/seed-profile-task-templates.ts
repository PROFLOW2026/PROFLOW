import 'server-only';

import type { DbExecutor } from '@/shared/db/types';
import type { BusinessProfileKey } from '@/modules/tenancy/domain/business-profiles';
import {
  PROFILE_TASK_TEMPLATE_SEEDS,
  profileTaskTemplateTitle,
} from '@/modules/tenancy/domain/profile-task-template-seeds';
import type { Locale } from '@/shared/i18n/config';
import {
  insertOrgProjectTaskTemplate,
  listOrgProjectTaskTemplates,
  nextOrgProjectTaskTemplatePosition,
} from '../data/org-project-task-templates.repository';

export async function seedProfileTaskTemplates(
  db: DbExecutor,
  organizationId: string,
  profileKey: BusinessProfileKey,
  locale: Locale,
): Promise<void> {
  const seeds = PROFILE_TASK_TEMPLATE_SEEDS[profileKey];
  if (!seeds?.length) return;

  const nameOf = (seed: (typeof seeds)[number]) => profileTaskTemplateTitle(seed, locale);

  const existing = await listOrgProjectTaskTemplates(db, organizationId);
  const titles = new Set(existing.map((row) => row.title.trim().toLowerCase()));

  for (const seed of seeds) {
    const title = nameOf(seed).trim();
    if (!title || titles.has(title.toLowerCase())) continue;

    const position = await nextOrgProjectTaskTemplatePosition(db, organizationId);
    await insertOrgProjectTaskTemplate(db, {
      organizationId,
      title,
      description: null,
      position,
    });
    titles.add(title.toLowerCase());
  }
}
