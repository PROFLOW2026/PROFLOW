import { sql, type SQL, type SQLWrapper } from 'drizzle-orm';
import { RESERVED_CUSTOM_FIELD_KEYS } from '../domain/reserved-keys';
import type { CustomFieldEntityType } from '../domain/types';

const RESERVED_KEY_SQL = sql.join(
  [...new Set(RESERVED_CUSTOM_FIELD_KEYS.map((key) => key.toLowerCase()))].map(
    (key) => sql`${key}`,
  ),
  sql`, `,
);

/**
 * Correlated EXISTS for list/search filters.
 * Matches tenant-scoped text/select values only — never money/number columns,
 * reserved financial keys, or archived definitions.
 */
export function existsSearchableCustomFieldValueSql(
  organizationId: string,
  entityType: CustomFieldEntityType,
  entityIdColumn: SQLWrapper,
  likeTerm: string,
): SQL {
  return sql`exists (
    select 1
    from custom_field_values cfv
    inner join custom_field_definitions cfd
      on cfd.id = cfv.definition_id
     and cfd.organization_id = cfv.organization_id
    where cfv.organization_id = ${organizationId}
      and cfd.organization_id = ${organizationId}
      and cfv.entity_id = ${entityIdColumn}
      and cfd.entity_type = ${entityType}
      and cfd.archived_at is null
      and cfd.field_type in ('text', 'select')
      and lower(cfd.key) not in (${RESERVED_KEY_SQL})
      and cfv.value_text ilike ${likeTerm}
  )`;
}
