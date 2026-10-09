import type { BusinessProfileKey } from './business-profiles';

export interface ProfileTaskTemplateSeed {
  readonly titleEn: string;
  readonly titleHe: string;
}

/** Minimal org project task templates seeded once per profile apply (idempotent by title). */
export const PROFILE_TASK_TEMPLATE_SEEDS: Partial<
  Record<BusinessProfileKey, readonly ProfileTaskTemplateSeed[]>
> = {
  ARCHITECT: [
    { titleEn: 'Concept review', titleHe: 'סקירת קונסепט' },
    { titleEn: 'Client design review', titleHe: 'סקירת תכנון מול לקוח' },
    { titleEn: 'IFC / permit package', titleHe: 'חבילת היתר / IFC' },
  ],
  DESIGNER: [
    { titleEn: 'Mood board approval', titleHe: 'אישור לוח השראה' },
    { titleEn: 'FF&E selection', titleHe: 'בחירת ריהוט וגימורים' },
    { titleEn: 'Site measure', titleHe: 'מדידת אתר' },
  ],
  ENGINEERING_CONSULTANT: [
    { titleEn: 'Kickoff meeting', titleHe: 'פגישת פתיחה' },
    { titleEn: 'Analysis & calculations', titleHe: 'ניתוח וחישובים' },
    { titleEn: 'Draft report', titleHe: 'טיוטת דוח' },
    { titleEn: 'Final delivery', titleHe: 'מסירה סופית' },
  ],
  PROJECT_MANAGEMENT: [
    { titleEn: 'Project kickoff', titleHe: 'פתיחת פרויקט' },
    { titleEn: 'Weekly coordination', titleHe: 'תיאום שבועי' },
    { titleEn: 'Owner milestone review', titleHe: 'סקירת אבני דרך' },
  ],
  GENERAL_CONTRACTOR: [
    { titleEn: 'Mobilization', titleHe: 'תנועת ציוד ופתיחת אתר' },
    { titleEn: 'Weekly site meeting', titleHe: 'ישיבת אתר שבועית' },
    { titleEn: 'Substantial completion walk', titleHe: 'סיור גמר ביצוע' },
  ],
  SMALL_WORKS: [
    { titleEn: 'Site visit / measure', titleHe: 'ביקור ומדידה' },
    { titleEn: 'Quote follow-up', titleHe: 'מעקב הצעת מחיר' },
    { titleEn: 'Job close-out', titleHe: 'סגירת עבודה' },
  ],
};
