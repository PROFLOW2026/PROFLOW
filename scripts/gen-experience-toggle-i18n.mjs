import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const registryPath = path.join(root, 'src/modules/tenancy/domain/experience-ui-registry.ts');
const src = readFileSync(registryPath, 'utf8');
const ids = [...new Set([...src.matchAll(/id: '([^']+)'/g)].map((m) => m[1]))];

const groups = {
  dashboardOwner: { en: 'Owner dashboard', he: 'דשבורד בעלים', ar: 'لوحة المالك', ru: 'Дашборд владельца' },
  dashboardCard: { en: 'Dashboard cards', he: 'כרטיסי דשבורד', ar: 'بطاقات لوحة التحكم', ru: 'Карточки дашборда' },
  dashboardCommon: { en: 'Shared dashboard blocks', he: 'מקטעים משותפים', ar: 'أقسام مشتركة', ru: 'Общие блоки' },
  navPrimary: { en: 'Main navigation', he: 'ניווט ראשי', ar: 'التنقل الرئيسي', ru: 'Главная навигация' },
  projectTab: { en: 'Optional project tabs', he: 'טאבי פרויקט אופציונליים', ar: 'علامات تبويب المشروع', ru: 'Вкладки проекта' },
  shortcuts: { en: 'Shortcuts', he: 'קיצורי דרך', ar: 'اختصارات', ru: 'Ярлыки' },
};

const OWNER_HE = {
  'owner.contractSummary': 'שורת סיכום חוזים',
  'owner.kpiRow': 'שורת מדדי KPI',
  'owner.cashForecast90': 'תחזית מזומנים 90 יום',
  'owner.apOutstanding': 'חובות לספקים',
  'owner.restoredSections': 'מקטעים משוחזרים',
  'owner.recentProjects': 'פרויקטים אחרונים',
  'owner.projectProfitTable': 'טבלת רווחיות פרויקטים',
  'owner.quickActions': 'פעולות מהירות',
  'owner.reportsLinks': 'קישורי דוחות',
};

const CARD_HE = {
  'card.activeWork': 'עבודה פעילה',
  'card.contractValue': 'שווי חוזים',
  'card.profit': 'רווח',
  'card.forecast': 'תחזית',
  'card.commitments': 'התחייבויות',
  'card.billing': 'חיובים',
  'card.collections': 'גבייה',
  'card.serviceToday': 'שירות היום',
  'card.timeUtilization': 'ניצולת זמן',
  'card.quotePipeline': 'צינור הצעות',
  'card.firstActions': 'פעולות ראשונות',
};

const COMMON_HE = {
  'common.pendingTime': 'שעות ממתינות לאישור',
  'common.laborReconciliation': 'התאמת עבודה',
  'common.attention': 'דורש תשומת לב',
  'shortcuts.dashboardQuickAccess': 'גישה מהירה בדשבורד',
};

const OWNER_AR = {
  'owner.contractSummary': 'ملخص العقد',
  'owner.kpiRow': 'صف مؤشرات الأداء',
  'owner.cashForecast90': 'توقعات نقدية 90 يومًا',
  'owner.apOutstanding': 'ذمم دائنة للموردين',
  'owner.restoredSections': 'أقسام مستعادة',
  'owner.recentProjects': 'مشاريع حديثة',
  'owner.projectProfitTable': 'جدول ربحية المشاريع',
  'owner.quickActions': 'إجراءات سريعة',
  'owner.reportsLinks': 'روابط التقارير',
};

const CARD_AR = {
  'card.activeWork': 'عمل نشط',
  'card.contractValue': 'قيمة العقد',
  'card.profit': 'ربح',
  'card.forecast': 'توقعات',
  'card.commitments': 'التزامات',
  'card.billing': 'فوترة',
  'card.collections': 'تحصيل',
  'card.serviceToday': 'خدمة اليوم',
  'card.timeUtilization': 'استخدام الوقت',
  'card.quotePipeline': 'مسار عروض الأسعار',
  'card.firstActions': 'إجراءات أولى',
};

const COMMON_AR = {
  'common.pendingTime': 'ساعات بانتظار الموافقة',
  'common.laborReconciliation': 'مطابقة العمل',
  'common.attention': 'يتطلب انتباهًا',
  'shortcuts.dashboardQuickAccess': 'وصول سريع في لوحة التحكم',
};

const OWNER_RU = {
  'owner.contractSummary': 'Сводка по договору',
  'owner.kpiRow': 'Строка KPI',
  'owner.cashForecast90': 'Кэш-прогноз 90 дней',
  'owner.apOutstanding': 'Кредиторская задолженность',
  'owner.restoredSections': 'Восстановленные блоки',
  'owner.recentProjects': 'Недавние проекты',
  'owner.projectProfitTable': 'Таблица прибыльности проектов',
  'owner.quickActions': 'Быстрые действия',
  'owner.reportsLinks': 'Ссылки на отчёты',
};

const CARD_RU = {
  'card.activeWork': 'Активная работа',
  'card.contractValue': 'Стоимость договора',
  'card.profit': 'Прибыль',
  'card.forecast': 'Прогноз',
  'card.commitments': 'Обязательства',
  'card.billing': 'Биллинг',
  'card.collections': 'Поступления',
  'card.serviceToday': 'Сервис сегодня',
  'card.timeUtilization': 'Использование времени',
  'card.quotePipeline': 'Воронка КП',
  'card.firstActions': 'Первые действия',
};

const COMMON_RU = {
  'common.pendingTime': 'Часы на согласовании',
  'common.laborReconciliation': 'Сверка труда',
  'common.attention': 'Требует внимания',
  'shortcuts.dashboardQuickAccess': 'Быстрый доступ на дашборде',
};

function loadJson(rel) {
  return JSON.parse(readFileSync(path.join(root, rel), 'utf8'));
}

function locSuffix(localeKey) {
  if (localeKey === 'he-IL') return 'he';
  return localeKey;
}

function descFor(localeKey) {
  if (localeKey === 'he-IL') return 'הצגה או הסתרה בתצוגה. לא מוחק נתונים.';
  if (localeKey === 'ar') return 'إظهار أو إخفاء في الواجهة. لا يحذف البيانات.';
  if (localeKey === 'ru') return 'Показ или скрытие в интерфейсе. Данные не удаляются.';
  return 'Show or hide in the UI. Does not delete data.';
}

function labelFor(id, localeKey) {
  const [group, key] = id.split('.');
  const localeDir = `src/locales/${localeKey}`;

  if (localeKey === 'he-IL') {
    if (OWNER_HE[id]) return OWNER_HE[id];
    if (CARD_HE[id]) return CARD_HE[id];
    if (COMMON_HE[id]) return COMMON_HE[id];
  }
  if (localeKey === 'ar') {
    if (OWNER_AR[id]) return OWNER_AR[id];
    if (CARD_AR[id]) return CARD_AR[id];
    if (COMMON_AR[id]) return COMMON_AR[id];
  }
  if (localeKey === 'ru') {
    if (OWNER_RU[id]) return OWNER_RU[id];
    if (CARD_RU[id]) return CARD_RU[id];
    if (COMMON_RU[id]) return COMMON_RU[id];
  }

  if (group === 'nav') {
    const nav = loadJson(`${localeDir}/nav.json`);
    if (nav[key]) return nav[key];
  }
  if (group === 'projectTab') {
    const projects = loadJson(`${localeDir}/projects.json`);
    const tab = projects?.workspace?.tabs?.[key];
    if (tab) return tab;
  }

  if (localeKey === 'en') {
    const tail = key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
    return tail;
  }

  if (group === 'nav' || group === 'projectTab') {
    const enNav = loadJson('src/locales/en/nav.json');
    const enProjects = loadJson('src/locales/en/projects.json');
    if (group === 'nav' && enNav[key]) return `[${localeKey}] ${enNav[key]}`;
    if (group === 'projectTab' && enProjects?.workspace?.tabs?.[key]) {
      return `[${localeKey}] ${enProjects.workspace.tabs[key]}`;
    }
  }

  const enTail = key.replace(/([A-Z])/g, ' $1');
  return `[${localeKey}] ${enTail}`;
}

function buildToggles(localeKey) {
  const out = {};
  for (const id of ids) {
    const i18nKey = id.replace(/\./g, '_');
    out[i18nKey] = { label: labelFor(id, localeKey), description: descFor(localeKey) };
  }
  return out;
}

function mergeLocale(localeKey) {
  const p = path.join(root, `src/locales/${localeKey}/settings.json`);
  const json = JSON.parse(readFileSync(p, 'utf8'));
  const exp = json.experience ?? {};
  const loc = locSuffix(localeKey);
  exp.customTogglesHint =
    localeKey === 'he-IL'
      ? 'במצב מותאם אישית: בחרו מה מוצג. הסתרה אינה חוסמת גישה לנתונים.'
      : localeKey === 'ar'
        ? 'في الوضع المخصص: اختر ما يُعرض. الإخفاء لا يمنع الوصول إلى البيانات.'
        : localeKey === 'ru'
          ? 'В пользовательском режиме выберите, что показывать. Скрытие не блокирует доступ к данным.'
          : 'In custom mode, choose what appears. Hiding does not block access to data.';
  exp.togglesRequireCustomMode =
    localeKey === 'he-IL'
      ? 'מתגי תצוגה זמינים במצב «מותאם אישית».'
      : localeKey === 'ar'
        ? 'مفاتيح العرض متاحة في وضع «مخصص».'
        : localeKey === 'ru'
          ? 'Переключатели доступны в режиме «Пользовательский».'
          : 'Display toggles are available in Custom mode.';
  exp.v2DisabledHint =
    localeKey === 'he-IL'
      ? 'תצוגת משפחות V2 כבויה בסביבה זו.'
      : localeKey === 'ar'
        ? 'عرض العائلات V2 معطّل في هذه البيئة.'
        : localeKey === 'ru'
          ? 'Семейства V2 отключены в этой среде.'
          : 'Experience family V2 is off in this environment.';
  exp.resetUi =
    localeKey === 'he-IL' ? 'איפוס התאמות תצוגה' : localeKey === 'ar' ? 'إعادة ضبط العرض' : localeKey === 'ru' ? 'Сброс UI' : 'Reset display customizations';
  exp.toggleLocked =
    localeKey === 'he-IL'
      ? 'נעול למשפחה הנוכחית. נשאר גלוי.'
      : localeKey === 'ar'
        ? 'مقفل للعائلة الحالية. يبقى ظاهرًا.'
        : localeKey === 'ru'
          ? 'Заблокировано для семьи. Остаётся видимым.'
          : 'Locked for this family. Stays visible.';
  if (localeKey === 'he-IL' && typeof exp.description === 'string') {
    exp.description = exp.description.replace(/[—–]/g, '.').replace(/\.\s*\./g, '.');
  }
  exp.groups = {};
  for (const [g, labels] of Object.entries(groups)) {
    exp.groups[g] = labels[loc];
  }
  exp.toggles = buildToggles(localeKey);
  json.experience = exp;
  writeFileSync(p, `${JSON.stringify(json, null, 2)}\n`, 'utf8');
}

for (const loc of ['en', 'he-IL', 'ar', 'ru']) mergeLocale(loc);
console.log('Updated experience toggles for', ids.length, 'ids');
