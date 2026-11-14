-- Multiple source files may reuse the same sheet_key (e.g. pdf_page "p1"); scope uniqueness per file.
DROP INDEX IF EXISTS public.takeoff_sheets_job_sheet_uq;
CREATE UNIQUE INDEX takeoff_sheets_job_sheet_uq ON public.takeoff_sheets (job_id, file_id, sheet_key);