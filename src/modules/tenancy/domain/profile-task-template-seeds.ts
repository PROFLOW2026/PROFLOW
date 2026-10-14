import type { Locale } from '@/shared/i18n/config';
import type { BusinessProfileKey } from './business-profiles';

export interface ProfileTaskTemplateSeed {
  readonly titleEn: string;
  readonly titleHe: string;
  readonly titleAr?: string;
  readonly titleRu?: string;
}

/** Minimal org project task templates seeded once per profile apply (idempotent by title). */
export const PROFILE_TASK_TEMPLATE_SEEDS: Partial<
  Record<BusinessProfileKey, readonly ProfileTaskTemplateSeed[]>
> = {
  ARCHITECT: [
    { titleEn: 'Concept review', titleHe: 'סקירת קונסепט', titleAr: 'مراجعة المفهوم', titleRu: 'Обзор концепции' },
    { titleEn: 'Client design review', titleHe: 'סקירת תכנון מול לקוח', titleAr: 'مراجعة التصميم مع العميل', titleRu: 'Согласование дизайна с заказчиком' },
    { titleEn: 'IFC / permit package', titleHe: 'חבילת היתר / IFC', titleAr: 'حزمة الترخيص / IFC', titleRu: 'Пакет разрешений / IFC' },
  ],
  DESIGNER: [
    { titleEn: 'Mood board approval', titleHe: 'אישור לוח השראה', titleAr: 'اعتماد لوحة الإلهام', titleRu: 'Утверждение mood board' },
    { titleEn: 'FF&E selection', titleHe: 'בחירת ריהוט וגימורים', titleAr: 'اختيار الأثاث والتشطيبات', titleRu: 'Выбор мебели и отделки' },
    { titleEn: 'Site measure', titleHe: 'מדידת אתר', titleAr: 'قياس الموقع', titleRu: 'Обмер объекта' },
  ],
  ENGINEERING_CONSULTANT: [
    { titleEn: 'Kickoff meeting', titleHe: 'פגישת פתיחה', titleAr: 'اجتماع افتتاح', titleRu: 'Стартовая встреча' },
    { titleEn: 'Analysis & calculations', titleHe: 'ניתוח וחישובים', titleAr: 'تحليل وحسابات', titleRu: 'Анализ и расчёты' },
    { titleEn: 'Draft report', titleHe: 'טיוטת דוח', titleAr: 'مسودة تقرير', titleRu: 'Черновик отчёта' },
    { titleEn: 'Final delivery', titleHe: 'מסירה סופית', titleAr: 'تسليم نهائي', titleRu: 'Итоговая сдача' },
  ],
  PROJECT_MANAGEMENT: [
    { titleEn: 'Project kickoff', titleHe: 'פתיחת פרויקט', titleAr: 'افتتاح المشروع', titleRu: 'Старт проекта' },
    { titleEn: 'Weekly coordination', titleHe: 'תיאום שבועי', titleAr: 'تنسيق أسبوعي', titleRu: 'Еженедельная координация' },
    { titleEn: 'Owner milestone review', titleHe: 'סקירת אבני דרך', titleAr: 'مراجعة المعالم', titleRu: 'Обзор вех' },
  ],
  GENERAL_CONTRACTOR: [
    { titleEn: 'Mobilization', titleHe: 'תנועת ציוד ופתיחת אתר', titleAr: 'تجهيز الموقع', titleRu: 'Мобилизация на объекте' },
    { titleEn: 'Weekly site meeting', titleHe: 'ישיבת אתר שבועית', titleAr: 'اجتماع موقع أسبوعي', titleRu: 'Еженедельное совещание на объекте' },
    { titleEn: 'Substantial completion walk', titleHe: 'סיור גמר ביצוע', titleAr: 'جولة إنجاز جوهري', titleRu: 'Обход существенного завершения' },
  ],
  SMALL_WORKS: [
    { titleEn: 'Site visit / measure', titleHe: 'ביקור ומדידה', titleAr: 'زيارة وقياس', titleRu: 'Выезд и замер' },
    { titleEn: 'Quote follow-up', titleHe: 'מעקב הצעת מחיר', titleAr: 'متابعة عرض السعر', titleRu: 'Сопровождение сметы' },
    { titleEn: 'Job close-out', titleHe: 'סגירת עבודה', titleAr: 'إغلاق العمل', titleRu: 'Закрытие работы' },
  ],
  RENOVATION: [
    { titleEn: 'Pre-renovation survey', titleHe: 'סקר לפני שיפוץ', titleAr: 'مسح قبل التجديد', titleRu: 'Обследование перед ремонтом' },
    { titleEn: 'Client selections', titleHe: 'בחירות לקוח', titleAr: 'اختيارات العميل', titleRu: 'Выборы заказчика' },
    { titleEn: 'Final walkthrough', titleHe: 'מסירה ללקוח', titleAr: 'تسليم للعميل', titleRu: 'Приёмка с заказчиком' },
  ],
  ELECTRICAL: [
    { titleEn: 'Panel schedule review', titleHe: 'בדיקת לוח חשמל', titleAr: 'مراجعة لوحة الكهرباء', titleRu: 'Проверка щита' },
    { titleEn: 'Rough-in inspection', titleHe: 'בדיקת שלד חשמל', titleAr: 'فحص التمديدات', titleRu: 'Проверка скрытых работ' },
    { titleEn: 'Final testing', titleHe: 'בדיקות גמר', titleAr: 'اختبارات نهائية', titleRu: 'Итоговые испытания' },
  ],
  PLUMBING: [
    { titleEn: 'Rough plumbing inspection', titleHe: 'בדיקת שלד אינסטלציה', titleAr: 'فحص التمديدات الأولية', titleRu: 'Проверка скрытых сантехработ' },
    { titleEn: 'Fixtures install', titleHe: 'התקנת אביזרים', titleAr: 'تركيب التجهيزات', titleRu: 'Монтаж сантехники' },
    { titleEn: 'Pressure test', titleHe: 'בדיקת לחץ', titleAr: 'اختبار ضغط', titleRu: 'Испытание на давление' },
  ],
  HVAC: [
    { titleEn: 'Equipment layout', titleHe: 'פריסת ציוד', titleAr: 'توزيع المعدات', titleRu: 'Размещение оборудования' },
    { titleEn: 'Duct / line set', titleHe: 'תעלות / צנרת', titleAr: 'مجاري / خطوط', titleRu: 'Воздуховоды / трассировка' },
    { titleEn: 'Commissioning', titleHe: 'הפעלה', titleAr: 'تشغيل', titleRu: 'Пусконаладка' },
  ],
  FIELD_SERVICE: [
    { titleEn: 'Dispatch confirmation', titleHe: 'אישור יציאה לשטח', titleAr: 'تأكيد الإرسال', titleRu: 'Подтверждение выезда' },
    { titleEn: 'On-site diagnosis', titleHe: 'אבחון בשטח', titleAr: 'تشخيص في الموقع', titleRu: 'Диагностика на объекте' },
    { titleEn: 'Service report', titleHe: 'דוח שירות', titleAr: 'تقرير خدمة', titleRu: 'Отчёт о сервисе' },
  ],
  SUBCONTRACTOR: [
    { titleEn: 'Scope confirmation', titleHe: 'אישור היקף', titleAr: 'تأكيد النطاق', titleRu: 'Подтверждение объёма' },
    { titleEn: 'Material delivery', titleHe: 'אספקת חומרים', titleAr: 'توريد مواد', titleRu: 'Поставка материалов' },
    { titleEn: 'Punch list close-out', titleHe: 'סגירת ליקויים', titleAr: 'إغلاق قائمة الملاحظات', titleRu: 'Закрытие punch list' },
  ],
};

export function profileTaskTemplateTitle(seed: ProfileTaskTemplateSeed, locale: Locale): string {
  if (locale === 'he-IL') return seed.titleHe;
  if (locale === 'ar') return seed.titleAr ?? seed.titleHe;
  if (locale === 'ru') return seed.titleRu ?? seed.titleHe;
  if (locale === 'en') return seed.titleEn;
  return seed.titleHe;
}
