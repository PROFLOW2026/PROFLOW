import { z } from 'zod';
import { REPORT_KINDS } from '../domain/types';

export const generateReportSchema = z.object({
  kind: z.enum(REPORT_KINDS),
  id: z.string().trim().min(1).max(128),
  locale: z.string().trim().min(2).max(16).optional(),
});

export type GenerateReportParsed = z.infer<typeof generateReportSchema>;
