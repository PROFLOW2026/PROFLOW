import { relations } from 'drizzle-orm';
import { index, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { primaryId, timestamps } from './_shared';

/**
 * Identity (doc 73 §2).
 *
 * `profiles.id` equals `auth.users.id`. Authentication data — passwords,
 * sessions, verification state — stays in Supabase Auth and is never mirrored
 * here. Profiles are not tenant-owned: one person can belong to many orgs.
 */
export const profiles = pgTable(
  'profiles',
  {
    // Not a generated default: the value must come from Supabase Auth.
    id: uuid('id').primaryKey(),
    /** Cached for display only; Auth remains the source of truth for login. */
    email: text('email').notNull(),
    displayName: text('display_name'),
    localePreference: text('locale_preference'),
    ...timestamps(),
  },
  (table) => [index('profiles_email_idx').on(table.email)],
);

/**
 * Non-authoritative cache of the last active organization. The server always
 * re-validates membership before trusting it (doc 73 §4).
 */
export const userPreferences = pgTable('user_preferences', {
  id: primaryId(),
  userId: uuid('user_id')
    .notNull()
    .unique()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  activeOrganizationId: uuid('active_organization_id'),
  ...timestamps(),
});

export const profilesRelations = relations(profiles, ({ one }) => ({
  preferences: one(userPreferences, {
    fields: [profiles.id],
    references: [userPreferences.userId],
  }),
}));
