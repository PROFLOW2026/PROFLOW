-- Migration 0142: API v1 cursor-pagination index + supporting indexes
--
-- Context: The GET /api/v1/projects endpoint was performing full-table scans
-- and applying the cursor filter in JavaScript. Cursor logic was moved into the
-- SQL WHERE clause (projects.repository.ts buildProjectListConditions) so the
-- DB can satisfy the query with an index scan instead.
--
-- DO NOT apply without explicit Owner approval (ProjectFlow release policy).
-- Prepared by: remediation agent (Auth/Architecture/Performance/Cleanup domain)

-- ── Projects: composite index for API v1 cursor-paginated list ───────────────
-- Covers: WHERE org_id = ? [AND created_at < ?] ORDER BY created_at DESC LIMIT ?
-- All three operations (filter, sort, limit) can be satisfied from this index
-- without a heap fetch for the common case where only org-scoped list is needed.
CREATE INDEX IF NOT EXISTS idx_projects_org_created_desc
  ON projects (organization_id, created_at DESC);

-- ── Projects: text-search support index ─────────────────────────────────────
-- ilike(projects.name, ...) in both listProjects and searchProjects; pg_trgm
-- is typically present on the Supabase stack and makes ILIKE O(log n) instead
-- of O(n). The index is created only when the extension is available so the
-- migration is safe on installations that do not have it.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_projects_name_trgm
               ON projects USING gin (name gin_trgm_ops)';
  END IF;
END $$;

-- ── Tasks: index for workspace-scoped task search ───────────────────────────
-- searchTasks joins tasks → workspaces → projects, filters by workspace_id and
-- organization_id, and orders by updated_at DESC.
CREATE INDEX IF NOT EXISTS idx_tasks_org_workspace_updated
  ON tasks (organization_id, workspace_id, updated_at DESC)
  WHERE archived_at IS NULL;
