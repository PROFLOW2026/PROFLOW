CREATE UNIQUE INDEX "change_orders_org_project_reference_uq" ON "change_orders" USING btree ("organization_id", "project_id", "reference");
