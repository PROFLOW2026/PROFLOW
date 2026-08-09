-- Wave 4: expand document_owner_type for Wave 3 entity linking.
-- Additive only. Does not invent financial semantics.
-- PRIVATE storage / signed-access architecture unchanged.

ALTER TYPE "public"."document_owner_type" ADD VALUE IF NOT EXISTS 'procurement_rfq';
ALTER TYPE "public"."document_owner_type" ADD VALUE IF NOT EXISTS 'purchase_order';
ALTER TYPE "public"."document_owner_type" ADD VALUE IF NOT EXISTS 'ap_bill';
ALTER TYPE "public"."document_owner_type" ADD VALUE IF NOT EXISTS 'daily_log';
ALTER TYPE "public"."document_owner_type" ADD VALUE IF NOT EXISTS 'punch_list_item';
ALTER TYPE "public"."document_owner_type" ADD VALUE IF NOT EXISTS 'inspection';
ALTER TYPE "public"."document_owner_type" ADD VALUE IF NOT EXISTS 'compliance_artifact';
ALTER TYPE "public"."document_owner_type" ADD VALUE IF NOT EXISTS 'asset';
ALTER TYPE "public"."document_owner_type" ADD VALUE IF NOT EXISTS 'inventory_item';
