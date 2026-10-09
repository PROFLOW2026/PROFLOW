-- 0175: attendance_correction_requests — service_role ALL for FORCE RLS parity (0137).
-- PREPARED ONLY — Owner applies after review.

DROP POLICY IF EXISTS attendance_correction_requests_service_all ON public.attendance_correction_requests;
CREATE POLICY attendance_correction_requests_service_all ON public.attendance_correction_requests
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
