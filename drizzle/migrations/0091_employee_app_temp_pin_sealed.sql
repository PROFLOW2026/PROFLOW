-- 0091: Encrypted owner-shareable temporary PIN (while pin_must_change + not expired).
-- Does NOT modify 0088/0089/0090.

ALTER TABLE public.employee_app_accounts
  ADD COLUMN IF NOT EXISTS temporary_pin_sealed text;

COMMENT ON COLUMN public.employee_app_accounts.temporary_pin_sealed IS
  'AES-256-GCM sealed 6-digit temp PIN for owner share only; cleared after use or expiry.';
