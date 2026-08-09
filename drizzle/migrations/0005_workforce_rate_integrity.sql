CREATE OR REPLACE FUNCTION rate_versions_assert_no_overlap()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM rate_versions existing
    WHERE existing.organization_id = NEW.organization_id
      AND existing.employee_id = NEW.employee_id
      AND existing.id IS DISTINCT FROM NEW.id
      AND daterange(existing.valid_from, COALESCE(existing.valid_to, 'infinity'::date), '[]')
          && daterange(NEW.valid_from, COALESCE(NEW.valid_to, 'infinity'::date), '[]')
  ) THEN
    RAISE EXCEPTION 'rate_versions_no_overlap';
  END IF;

  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER rate_versions_no_overlap
  BEFORE INSERT OR UPDATE ON rate_versions
  FOR EACH ROW
  EXECUTE FUNCTION rate_versions_assert_no_overlap();
