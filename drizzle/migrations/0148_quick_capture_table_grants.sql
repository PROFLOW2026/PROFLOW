-- 0148: Quick Capture table privileges for authenticated and service_role.
-- 0131 created quick_capture_items / quick_capture_item_documents with RLS policies
-- but omitted table GRANTs. Without GRANTs, authenticated INSERT fails with 42501
-- before RLS runs. Do NOT modify 0131 (already applied).

GRANT SELECT, INSERT, UPDATE, DELETE
ON public.quick_capture_items
TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
ON public.quick_capture_item_documents
TO authenticated;

GRANT ALL PRIVILEGES
ON public.quick_capture_items
TO service_role;

GRANT ALL PRIVILEGES
ON public.quick_capture_item_documents
TO service_role;
