-- 0064_payment_terms_eom_90_120
-- Additive only. Does NOT modify 0000–0063.
-- UNAPPLIED — Owner applies later.
--
-- Idempotent seed of eom_90 / eom_120 payment terms for existing orgs
-- (שוטף + 90 / שוטף + 120). Aligns with DEFAULT_PAYMENT_TERMS in
-- src/modules/business-catalog/domain/types.ts.

INSERT INTO public.organization_catalog_entries (
  organization_id, kind, key, name, metadata, sort_order, is_system, is_active
)
SELECT o.id, v.kind, v.key, v.name, v.metadata::jsonb, v.sort_order, true, true
FROM public.organizations o
CROSS JOIN (
  VALUES
    (
      'payment_term',
      'eom_90',
      'EOM + 90',
      '{"strategy":"eom_plus_days","eomOffsetDays":90}',
      105
    ),
    (
      'payment_term',
      'eom_120',
      'EOM + 120',
      '{"strategy":"eom_plus_days","eomOffsetDays":120}',
      108
    )
) AS v(kind, key, name, metadata, sort_order)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.organization_catalog_entries e
  WHERE e.organization_id = o.id
    AND e.kind = v.kind
    AND e.key = v.key
);
