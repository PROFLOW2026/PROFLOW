/** Canonical consultancy demo seed — tenant-safe constants. */

/** Primary Owner — consultancy demo login. */
export const PRIMARY_USER_EMAIL = 'leokid2026@gmail.com';
/** Secondary Owner — switches between contractor + consultancy demos. */
export const SECONDARY_USER_EMAIL = 'mthsystems@gmail.com';
/** @deprecated Use PRIMARY_USER_EMAIL for seed actor context. */
export const DEMO_USER_EMAIL = PRIMARY_USER_EMAIL;

/** Real production business — NEVER modify. */
export const EXCLUDED_ORG_NAME = 'מתח ח.י הנדסת חשמל בע"מ';

/** Existing contractor demo org — preserve data; disable UWM for separation. */
export const CONTRACTOR_DEMO_ORG_ID = 'b1460c82-36cd-429a-b30d-ea5644d58fe3';
export const CONTRACTOR_DEMO_ORG_NAME = 'פרופלו מערכות חשמל והנדסה בע"מ';

/** New consultancy demo org — stable id for idempotent provisioning. */
export const CONSULTANCY_DEMO_ORG_ID = 'c8f4a2e1-9b3d-4f7a-ae6c-1d2e3f4a5b6c';
export const CONSULTANCY_ORG_NAME = 'אופק הנדסת חשמל וייעוץ בע"מ';

export const SEED_MARKER = 'PF-CONSULTANCY-DEMO';
export const SEED_SETTING_KEY = 'consultancy_demo_seed_version';
export const SEED_VERSION = '2026-09-20-v2';
export const CORRECTION_SETTING_KEY = 'consultancy_demo_correction_version';
export const CORRECTION_VERSION = '2026-09-20-data-pass-v1';

export const BUSINESS_START = '2026-01-01';
export const HISTORY_END = '2026-09-20';

/** Approved task band after duplicate cleanup. */
export const TASK_TARGET_MIN = 1200;
export const TASK_TARGET_MAX = 1500;
export const TASK_TARGET_IDEAL = 1350;

export const STAGE_NAMES = [
  'פתיחת פרויקט ואיסוף חומר',
  'אפיון ופרוגרמה',
  'תכנון מוקדם',
  'תכנון מפורט',
  'תיאום מערכות',
  'אישורים',
  'מכרז',
  'תוכניות לביצוע',
  'ביצוע ופיקוח עליון',
  'בדיקת Shop Drawings',
  'מסירה / As Made',
  'סגירה',
] as const;

export const INTERNAL_WORKSPACES = [
  'ניהול המשרד',
  'משימות מנהלה',
  'שיווק והצעות מחיר',
  'תקנים ועדכונים מקצועיים',
  'ישיבת צוות',
] as const;

/** Valid optional module keys only — projects/expenses are core and always on. */
export const CONSULTANCY_MODULES = [
  'work_management',
  'clients',
  'documents',
  'billing',
  'workforce',
  'vendors',
  'approvals',
  'changes',
  'command_center',
] as const;

export const EMPLOYEES = [
  { key: 'e1', name: 'אורי לביא', jobTitle: 'מהנדס חשמל ראשי / בעלים', employeeNumber: 'PF-CON-DEMO-EMP-01', baseRate: '42000', companyOnly: false, chief: true },
  { key: 'e2', name: 'יעל כהן', jobTitle: 'מהנדסת חשמל', employeeNumber: 'PF-CON-DEMO-EMP-02', baseRate: '25000', companyOnly: false, chief: false },
  { key: 'e3', name: 'רועי מזרחי', jobTitle: 'מהנדס חשמל', employeeNumber: 'PF-CON-DEMO-EMP-03', baseRate: '24000', companyOnly: false, chief: false },
  { key: 'e4', name: 'דניאל אברהם', jobTitle: 'הנדסאי חשמל', employeeNumber: 'PF-CON-DEMO-EMP-04', baseRate: '18000', companyOnly: false, chief: false },
  { key: 'e5', name: 'נועה פרץ', jobTitle: 'הנדסאית חשמל', employeeNumber: 'PF-CON-DEMO-EMP-05', baseRate: '17500', companyOnly: false, chief: false },
  { key: 'e6', name: 'מיכל בן דוד', jobTitle: 'מנהלת משרד ואדמיניסטרציה', employeeNumber: 'PF-CON-DEMO-EMP-06', baseRate: '15000', companyOnly: true, chief: false },
] as const;
