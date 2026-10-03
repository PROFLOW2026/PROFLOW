# Data deletion / erasure request procedure (support-managed — L2)

**Public promise:** Privacy Policy (Hebrew) — users request deletion via support; no self-service UI in v1.

## 1. Intake

- Receive request via **support channel provided at onboarding** or through **organization owner**.
- Record: requester identity, email, organization name/id, scope (user only / full org), date.

## 2. Verify authority

- **User-only:** confirm requester owns the account (login email match + optional ID check per contract).
- **Organization:** confirm requester is **owner** or authorized signatory on file.

## 3. Scope identification

- Map Supabase `user_id`, `organization_id`, memberships, employee app accounts.
- List integrations: external storage connections, SUMIT credentials, API keys/webhooks.
- Note **statutory documents** already issued (SUMIT) — may require credit/cancel in provider, not silent DB delete.

## 4. Execution (supported steps)

- Deactivate memberships; revoke employee app access; block login if required.
- Remove or anonymize user profile where schema allows.
- For **full org closure:** coordinate export if requested, then disable org access; delete or archive per retention policy.
- **Files:** metadata in Postgres; bytes in customer-connected cloud — customer may need to delete cloud folders separately.
- **Backups:** Supabase/Vercel platform retention — document limits to requester.

## 5. Retention exceptions

- Financial/statutory records required by law or active dispute.
- Audit logs may be retained in truncated form where required.

## 6. Confirmation

- Email requester when complete with summary of what was deleted vs retained and why.

## Missing real-world inputs (publish when available)

- Named **data protection contact** email/address for Privacy Policy footer (not hardcoded in product until Owner supplies).
