-- Light scheduling / progress (doc 22 Layer A).
-- Optional: organizations that ignore scheduling are unaffected.
-- Does NOT introduce Gantt, critical path, or resource leveling.

ALTER TABLE "projects"
  ADD COLUMN "progress_percent" numeric(9, 6),
  ADD COLUMN "progress_status" text;

ALTER TABLE "projects"
  ADD CONSTRAINT "projects_progress_percent_range"
  CHECK (
    "progress_percent" IS NULL
    OR ("progress_percent" >= 0 AND "progress_percent" <= 100)
  );

ALTER TABLE "projects"
  ADD CONSTRAINT "projects_progress_status_known"
  CHECK (
    "progress_status" IS NULL
    OR "progress_status" IN (
      'not_started',
      'on_track',
      'at_risk',
      'delayed',
      'completed'
    )
  );

ALTER TABLE "work_packages"
  ADD COLUMN "start_date" date,
  ADD COLUMN "end_date" date,
  ADD COLUMN "progress_percent" numeric(9, 6);

ALTER TABLE "work_packages"
  ADD CONSTRAINT "work_packages_progress_percent_range"
  CHECK (
    "progress_percent" IS NULL
    OR ("progress_percent" >= 0 AND "progress_percent" <= 100)
  );

CREATE TABLE "project_milestones" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "work_package_id" uuid REFERENCES "work_packages"("id") ON DELETE SET NULL,
  "name" text NOT NULL,
  "target_date" date,
  "completed_at" date,
  "status" text DEFAULT 'planned' NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "notes" text,
  "archived_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "project_milestones_status_known" CHECK (
    "status" IN ('planned', 'achieved', 'missed', 'cancelled')
  )
);

CREATE INDEX "project_milestones_project_idx" ON "project_milestones" ("project_id");
CREATE INDEX "project_milestones_org_idx" ON "project_milestones" ("organization_id");

ALTER TABLE "project_milestones" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "project_milestones" FORCE ROW LEVEL SECURITY;

CREATE POLICY "project_milestones_tenant_select"
  ON "project_milestones" FOR SELECT TO authenticated
  USING (app.is_org_member(organization_id));

CREATE POLICY "project_milestones_tenant_insert"
  ON "project_milestones" FOR INSERT TO authenticated
  WITH CHECK (app.is_org_member(organization_id));

CREATE POLICY "project_milestones_tenant_update"
  ON "project_milestones" FOR UPDATE TO authenticated
  USING (app.is_org_member(organization_id))
  WITH CHECK (app.is_org_member(organization_id));

CREATE POLICY "project_milestones_tenant_delete"
  ON "project_milestones" FOR DELETE TO authenticated
  USING (app.is_org_member(organization_id));

CREATE POLICY "project_milestones_service_all"
  ON "project_milestones" FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
