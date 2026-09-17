-- 0090: Global unique employee app usernames (login = username + PIN only).
-- Does NOT modify 0088/0089 (already applied).
--
-- 1. Repair cross-organization username_normalized collisions (keep oldest account).
-- 2. Add global unique index on username_normalized.

DO $$
DECLARE
  group_rec RECORD;
  acct_rec RECORD;
  rank int;
  base_username text;
  new_username text;
  new_normalized text;
  suffix_letters constant text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  suffix_idx int;
BEGIN
  FOR group_rec IN
    SELECT username_normalized
    FROM public.employee_app_accounts
    GROUP BY username_normalized
    HAVING COUNT(*) > 1
  LOOP
    rank := 0;
    FOR acct_rec IN
      SELECT id, username, username_normalized, organization_id, created_at
      FROM public.employee_app_accounts
      WHERE username_normalized = group_rec.username_normalized
      ORDER BY created_at ASC, id ASC
    LOOP
      rank := rank + 1;
      IF rank = 1 THEN
        RAISE NOTICE 'employee_app username collision: kept account % (org %) as %',
          acct_rec.id, acct_rec.organization_id, acct_rec.username;
        CONTINUE;
      END IF;

      base_username := acct_rec.username;
      suffix_idx := rank - 1;

      LOOP
        IF suffix_idx <= length(suffix_letters) THEN
          new_username := base_username || substr(suffix_letters, suffix_idx, 1);
        ELSE
          new_username := base_username || (suffix_idx - length(suffix_letters))::text;
        END IF;
        new_normalized := lower(new_username);

        EXIT WHEN NOT EXISTS (
          SELECT 1
          FROM public.employee_app_accounts e
          WHERE e.username_normalized = new_normalized
            AND e.id <> acct_rec.id
        );

        suffix_idx := suffix_idx + 1;
        IF suffix_idx > 50 THEN
          RAISE EXCEPTION 'employee_app username collision repair failed for account %', acct_rec.id;
        END IF;
      END LOOP;

      UPDATE public.employee_app_accounts
      SET
        username = new_username,
        username_normalized = new_normalized,
        updated_at = now()
      WHERE id = acct_rec.id;

      RAISE NOTICE 'employee_app username collision: account % (org %) renamed % -> %',
        acct_rec.id, acct_rec.organization_id, acct_rec.username, new_username;
    END LOOP;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS employee_app_accounts_username_global_uq
  ON public.employee_app_accounts (username_normalized);
