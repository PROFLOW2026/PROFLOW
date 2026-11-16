import { demoDay } from '@/modules/demo/domain/session-clock';
import { getBusinessProfile } from '@/modules/tenancy/domain/business-profiles';
import {
  ONBOARDING_BUSINESS_TYPES,
  type OnboardingBusinessType,
} from '@/modules/tenancy/domain/onboarding-experience';

export type DemoFixtureTaskStatus =
  | 'todo'
  | 'in_progress'
  | 'in_review'
  | 'blocked'
  | 'done'
  | 'cancelled';

export interface DemoFixtureProject {
  readonly key: string;
  readonly name: string;
  readonly status: 'draft' | 'active' | 'on_hold' | 'completed';
  readonly clientKey: string;
  readonly startedDate: string;
}

export interface DemoFixtureExpense {
  readonly projectKey: string;
  readonly vendorKey: string;
  readonly description: string;
  readonly netAmount: string;
  readonly grossAmount: string;
  readonly expenseDate: string;
}

export interface DemoFixtureBilling {
  readonly key: string;
  readonly projectKey: string;
  readonly clientKey: string;
  readonly reference: string;
  readonly subtotalAmount: string;
  readonly totalAmount: string;
  readonly issueDate: string;
}

export interface DemoFixtureContract {
  readonly key: string;
  readonly projectKey: string;
  readonly clientKey: string;
  readonly name: string;
  readonly originalValueNet: string;
  readonly startDate: string;
}

export interface DemoFixturePayment {
  readonly billingKey: string;
  readonly projectKey: string;
  readonly clientKey: string;
  readonly amount: string;
  readonly paymentDate: string;
  readonly reference: string;
}

export interface DemoFixtureVendorBill {
  readonly key: string;
  readonly projectKey: string;
  readonly vendorKey: string;
  readonly reference: string;
  readonly netAmount: string;
  readonly grossAmount: string;
  readonly taxAmount: string;
  readonly billDate: string;
}

export interface DemoFixtureTimeEntry {
  readonly employeeKey: string;
  readonly projectKey: string;
  readonly workDate: string;
  readonly hours: string;
  readonly description: string;
}

export interface DemoFixture {
  readonly profileKey: OnboardingBusinessType;
  readonly organizationName: string;
  readonly anchorDay: string;
  readonly clients: readonly { readonly key: string; readonly name: string }[];
  readonly employees: readonly { readonly key: string; readonly name: string }[];
  readonly vendors: readonly { readonly key: string; readonly name: string; readonly type: 'supplier' | 'subcontractor' }[];
  readonly projects: readonly DemoFixtureProject[];
  readonly tasks: readonly {
    readonly title: string;
    readonly projectKey: string;
    readonly status: DemoFixtureTaskStatus;
    readonly startDate?: string;
    readonly dueDate?: string;
    readonly completionDate?: string;
  }[];
  readonly expenses: readonly DemoFixtureExpense[];
  readonly billing: readonly DemoFixtureBilling[];
  readonly contracts: readonly DemoFixtureContract[];
  readonly payments: readonly DemoFixturePayment[];
  readonly vendorBills: readonly DemoFixtureVendorBill[];
  readonly timeEntries: readonly DemoFixtureTimeEntry[];
  readonly documents: readonly { readonly fileName: string; readonly projectKey: string }[];
  readonly boqItems: readonly { readonly description: string; readonly projectKey: string; readonly unitPrice: string }[];
  readonly attendanceDates: readonly string[];
}

function money(amount: number): string {
  return amount.toFixed(2);
}

function grossFromNet(net: number): string {
  return (Math.round(net * 1.18 * 100) / 100).toFixed(2);
}

function taxFromNet(net: number): string {
  return (Number(grossFromNet(net)) - net).toFixed(2);
}

function profileUsesBoq(profileKey: OnboardingBusinessType): boolean {
  const profile = getBusinessProfile(profileKey);
  if (!profile) return false;
  if (profileKey === 'ELECTRICAL') return true;
  return profile.visibleModules.includes('boq');
}

interface TradeRoster {
  readonly clients: readonly { readonly key: string; readonly name: string }[];
  readonly employees: readonly { readonly key: string; readonly name: string }[];
  readonly vendors: readonly { readonly key: string; readonly name: string; readonly type: 'supplier' | 'subcontractor' }[];
}

function rosterForProfile(profileKey: OnboardingBusinessType, domain: string): TradeRoster {
  const clientLabels: Record<OnboardingBusinessType, readonly string[]> = {
    GENERAL_CONTRACTOR: ['מגדלי הבנים בע"מ', 'קבוצת נדל"ן השרון', 'עיריית חולון — אגף הנכסים', 'יזמות גשר צפון'],
    ELECTRICAL: ['מפעלי חשמל לפוט', 'רשת מלונות דן', 'מוסד חינוך אורט', 'ייזום מגורים גבעתיים'],
    PLUMBING: ['דיור מוגן רעננה', 'בית חולים כרמל', 'שכונת השבטים', 'מרכז קניות הנחלה'],
    HVAC: ['משרדי הייטק חיפה', 'מלון ים המלח', 'בית ספר אורט', 'מפעל מזון גליל'],
    RENOVATION: ['דירת יוקרה רמת אביב', 'ועד בית תל אביב', 'חנות אופנה דיזנגוף', 'מסעדת שף הרצליה'],
    SMALL_WORKS: ['משפחת כהן — שיפוץ', 'משרד עורכי דין לב', 'בית קפה רוטשילד', 'חנות אלקטרוניקה'],
    FIELD_SERVICE: ['רשת מסעדות', 'בית אבות גן שמואל', 'חניון עירוני', 'מפעל אריזה'],
    MAINTENANCE: ['מתחם משרדים רקפת', 'בית ספר יסודי', 'מרכז ספורט', 'קניון עזריאלי'],
    FACILITY_MANAGEMENT: ['חברת נדל"ן אלון', 'קמפוס הייטק', 'בית חולים שיבא', 'מפעל תעשייה'],
    LANDSCAPING: ['צמחיית פרויקט יזרעאל', 'גן ציבורי רמת גן', 'ביית מלון בוטיק', 'שכונת עליות'],
    CLEANING: ['מגדל משרדים A', 'בית ספר יסודי', 'מרכז רפואי', 'קניון עירוני'],
    INSTALLATION: ['חברת מדיה', 'אולם אירועים', 'מפעל ייצור', 'חנות רהיטים'],
    ARCHITECT: ['יזמות נחלים', 'עיריית ראשון', 'רשת בתי מלון', 'דיור מוגן'],
    DESIGNER: ['דירת פנטהאוז', 'מסעדת שף', 'משרדי עורכי דין', 'חנות עיצוב'],
    ENGINEERING_CONSULTANT: ['פרויקט תשתית דרום', 'מפעל כימי', 'מגדל מגורים', 'מתקן תחבורה'],
    SAFETY_INSPECTION_CONSULTANT: ['קבלן ראשי אתר', 'מפעל פלסטיק', 'אתר בנייה חדש', 'פרויקט תשתית'],
    SUBCONTRACTOR: ['קבלן ראשי מגורים', 'יזמות מסחרית', 'משרדי ממשלה', 'בית ספר חדש'],
    PROJECT_MANAGEMENT: ['יזמות ירוקה', 'תשתית עירונית', 'מתחם משרדים', 'מגדלי מגורים'],
    REAL_ESTATE_DEVELOPMENT: ['קרקע צפונית', 'יזמות שדרות', 'פרויקט מגורים', 'מתחם מסחרי'],
    MIXED_PROJECT_SERVICE: ['לקוח משולב א', 'לקוח משולב ב', 'רשת שירות', 'יזמות משולבת'],
  };
  const employeeLabels: Record<OnboardingBusinessType, readonly string[]> = {
    GENERAL_CONTRACTOR: ['מנהל פרויקט ראשי', 'מנהלת אתר', 'מהנדס ביצוע', 'מנהל רכש', 'מנהלת משרד', 'פועל שלד'],
    ELECTRICAL: ['מנהל פרויקט חשמל', 'חשמלאי בכיר', 'חשמלאי שטח', 'מנהלת משרד', 'מתכנן חשמל', 'עוזר טכני'],
    PLUMBING: ['מנהל עבודות אינסטלציה', 'אינסטלטור ותיק', 'אינסטלטור שטח', 'מזכירות', 'מפקח איכות', 'עוזר שטח'],
    HVAC: ['מנהל פרויקט מיזוג', 'טכנאי מיזוג בכיר', 'טכנאי שטח', 'מנהלת שירות', 'מתכנן מיזוג', 'מחסנאי'],
    RENOVATION: ['מנהל שיפוץ', 'מנהל עבודה', 'טכנאי גמרים', 'מנהלת משרד', 'מפקח שטח', 'פועל שיפוצים'],
    SMALL_WORKS: ['מנהל עבודות קטנות', 'עובד שטח', 'מנהלת מכירות', 'צבעי', 'נגר', 'עוזר'],
    FIELD_SERVICE: ['מנהל שירות', 'טכנאי שטח', 'מתאם קריאות', 'מנהלת משרד', 'טכנאי בכיר', 'חלקי חילוף'],
    MAINTENANCE: ['מנהל תחזוקה', 'טכנאי אחזקה', 'דייר שטח', 'מנהלת בקרה', 'חשמלאי תחזוקה', 'נציג שטח'],
    FACILITY_MANAGEMENT: ['מנהל מתקן', 'מנהל אתר', 'טכנאי מערכות', 'מנהלת משרד', 'מפקח ניקיון', 'אחראי בטיחות'],
    LANDSCAPING: ['מנהל גינון', 'מעצב נוף', 'עובד שטח', 'מנהלת משרד', 'השקיה', 'מפעיל ציוד'],
    CLEANING: ['מנהל ניקיון', 'מפקחת ניקיון', 'עובדת שטח', 'רכז משמרות', 'מנהל איכות', 'מנהלת לקוחות'],
    INSTALLATION: ['מנהל התקנות', 'טכנאי התקנה', 'מנהל פרויקט', 'מנהלת משרד', 'מפקח בקרה', 'מלגזן'],
    ARCHITECT: ['אדריכל ראשי', 'אדריכלית פרויקט', 'מתכנן פנים', 'מנהלת משרד', 'טכנאי הדמיות', 'מתאם רשויות'],
    DESIGNER: ['מעצבת ראשית', 'מעצב פנים', 'מנהל פרויקט', 'מנהלת סטודיו', 'טכנאי ויזואליזציה', 'רכש חומרים'],
    ENGINEERING_CONSULTANT: ['מהנדס ראשי', 'מהנדס מבנים', 'מתאם תשתיות', 'מנהלת משרד', 'מהנדס ביצוע', 'טכנאי משרד'],
    SAFETY_INSPECTION_CONSULTANT: ['יועץ בטיחות ראשי', 'מפקח בטיחות', 'מתאם הדרכות', 'מנהלת משרד', 'מפקח שטח', 'רכז תיעוד'],
    SUBCONTRACTOR: ['מנהל קבלן משנה', 'מנהל עבודה', 'פועל מיומן', 'מנהלת משרד', 'מפקח איכות', 'עובד שטח'],
    PROJECT_MANAGEMENT: ['מנהל פרויקטים', 'מתאם תכנון', 'בקר תקציב', 'מנהלת משרד', 'מפקח שטח', 'מתמחה'],
    REAL_ESTATE_DEVELOPMENT: ['מנהל פיתוח', 'מנהל ביצוע', 'כלכלן פרויקט', 'מנהלת משרד', 'מפקח אתר', 'רכז היתרים'],
    MIXED_PROJECT_SERVICE: ['מנהל שירות ופרויקטים', 'עובד שטח', 'מתאם משרד', 'מנהל פרויקט', 'טכנאי', 'מזכירות'],
  };
  const vendorLabels = [
    { key: 'v-supplier-1', type: 'supplier' as const, name: `חומרי ${domain} — אספקה מרכזית` },
    { key: 'v-supplier-2', type: 'supplier' as const, name: `ציוד ${domain} בע"מ` },
    { key: 'v-sub-1', type: 'subcontractor' as const, name: `קבלן משנה ${domain}` },
    { key: 'v-sub-2', type: 'subcontractor' as const, name: `צוות מקצועי ${domain}` },
  ];
  const clientNames = clientLabels[profileKey];
  const employeeNames = employeeLabels[profileKey];
  return {
    clients: clientNames.map((name, index) => ({ key: `c${index + 1}`, name })),
    employees: employeeNames.map((name, index) => ({ key: `e${index + 1}`, name })),
    vendors: vendorLabels,
  };
}

function documentNamesForProfile(profileKey: OnboardingBusinessType, noun: string): readonly string[] {
  const byTrade: Partial<Record<OnboardingBusinessType, readonly string[]>> = {
    ELECTRICAL: ['תכנית חשמל — גמר', 'טופס בדיקה 5', 'אישור חשמלאי מאשר'],
    PLUMBING: ['תכנית אינסטלציה', 'דוח בדיקת לחות', 'אישור מקומי'],
    HVAC: ['תוכנית מיזוג', 'דוח איזון', 'טופס אחזקה'],
    ARCHITECT: ['תוכנית אדריכלית', 'הגשה לוועדה', 'מפרט טכני'],
    CLEANING: ['מפרט ניקיון', 'לוח משמרות', 'דוח בקרת איכות'],
    DESIGNER: ['לוח השראה', 'מפרט חומרים', 'תוכנית עיצוב'],
  };
  return byTrade[profileKey] ?? [`מפרט ${noun}`, `תוכנית עבודה — ${noun}`, 'דוח מצב שטח.pdf'];
}

export function buildDemoFixture(
  profileKey: OnboardingBusinessType,
  anchor: Date = new Date(),
): DemoFixture {
  const profile = getBusinessProfile(profileKey);
  if (!profile) {
    throw new Error(`Missing business profile ${profileKey}`);
  }
  const noun = profile.terminology.project.he;
  const domain = profile.domains[0]?.nameHe ?? profile.terminology.project.he;
  const categories = profile.costCategories.map((row) => row.nameHe);
  const roster = rosterForProfile(profileKey, domain);
  const day = (offset: number) => demoDay(anchor, offset);

  const projectDefs = [
    { key: 'p-draft', name: `${noun} חדש — הכנת הצעה`, status: 'draft' as const, clientKey: 'c3', startOffset: -14 },
    { key: 'p-active', name: `${noun} פעיל — ${domain}`, status: 'active' as const, clientKey: 'c1', startOffset: -120 },
    { key: 'p-active-2', name: `${noun} שטח שני`, status: 'active' as const, clientKey: 'c2', startOffset: -45 },
    { key: 'p-hold', name: `${noun} בהמתנה`, status: 'on_hold' as const, clientKey: 'c2', startOffset: -200 },
    { key: 'p-done', name: `${noun} שהושלם`, status: 'completed' as const, clientKey: 'c4', startOffset: -280 },
    { key: 'p-pipeline', name: `${noun} בתכנון`, status: 'draft' as const, clientKey: 'c4', startOffset: -7 },
    { key: 'p-service', name: `${profile.terminology.job.he} שוטפת`, status: 'active' as const, clientKey: 'c3', startOffset: -21 },
    { key: 'p-archive', name: `${noun} היסטורי`, status: 'completed' as const, clientKey: 'c1', startOffset: -365 },
  ];
  const projects: DemoFixtureProject[] = projectDefs.map((row) => ({
    key: row.key,
    name: row.name,
    status: row.status,
    clientKey: row.clientKey,
    startedDate: day(row.startOffset),
  }));

  const legacyActiveNets = [40_000, 12_500, 8_000, 6_400];
  const extraExpenseRows = [
    { net: 5_100, projectKey: 'p-hold', vendorKey: 'v-sub-1', cat: 0, offset: -25 },
    { net: 4_300, projectKey: 'p-hold', vendorKey: 'v-supplier-2', cat: 1, offset: -18 },
    { net: 2_800, projectKey: 'p-done', vendorKey: 'v-sub-2', cat: 2, offset: -60 },
    { net: 1_900, projectKey: 'p-done', vendorKey: 'v-supplier-1', cat: 0, offset: -55 },
    { net: 3_600, projectKey: 'p-active-2', vendorKey: 'v-supplier-1', cat: 1, offset: -12 },
    { net: 2_200, projectKey: 'p-service', vendorKey: 'v-sub-1', cat: 2, offset: -8 },
    { net: 1_750, projectKey: 'p-archive', vendorKey: 'v-supplier-2', cat: 0, offset: -300 },
  ];

  const expenses: DemoFixtureExpense[] = [
  ...legacyActiveNets.map((net, index) => ({
    projectKey: 'p-active',
    vendorKey: index % 2 === 0 ? 'v-supplier-1' : 'v-sub-1',
    description: `${categories[index % categories.length] ?? 'עלות ישירה'} — שלב ${index + 1}`,
    netAmount: money(net),
    grossAmount: grossFromNet(net),
    expenseDate: day(-30 + index * 5),
  })),
  ...extraExpenseRows.map((row) => ({
    projectKey: row.projectKey,
    vendorKey: row.vendorKey,
    description: `${categories[row.cat % categories.length] ?? 'עלות ישירה'} — ${domain}`,
    netAmount: money(row.net),
    grossAmount: grossFromNet(row.net),
    expenseDate: day(row.offset),
  })),
  ];

  const billingNets = [
    { key: 'b-active-1', net: 180_000, projectKey: 'p-active', clientKey: 'c1', offset: -75, idx: 1 },
    { key: 'b-active-2', net: 42_000, projectKey: 'p-active', clientKey: 'c1', offset: -45, idx: 2 },
    { key: 'b-active-3', net: 15_000, projectKey: 'p-active', clientKey: 'c1', offset: -20, idx: 3 },
    { key: 'b-active2-1', net: 68_000, projectKey: 'p-active-2', clientKey: 'c2', offset: -35, idx: 4 },
    { key: 'b-done-1', net: 96_000, projectKey: 'p-done', clientKey: 'c4', offset: -90, idx: 5 },
    { key: 'b-hold-1', net: 24_000, projectKey: 'p-hold', clientKey: 'c2', offset: -15, idx: 6 },
  ];

  const billing: DemoFixtureBilling[] = billingNets.map((row) => ({
    key: row.key,
    projectKey: row.projectKey,
    clientKey: row.clientKey,
    reference: `DEMO-${profileKey.slice(0, 6)}-${row.idx}`,
    subtotalAmount: money(row.net),
    totalAmount: grossFromNet(row.net),
    issueDate: day(row.offset),
  }));

  const payments: DemoFixturePayment[] = [
    {
      billingKey: 'b-active-1',
      projectKey: 'p-active',
      clientKey: 'c1',
      amount: grossFromNet(120_000),
      paymentDate: day(-40),
      reference: 'REC-1001',
    },
    {
      billingKey: 'b-active-1',
      projectKey: 'p-active',
      clientKey: 'c1',
      amount: grossFromNet(40_000),
      paymentDate: day(-10),
      reference: 'REC-1002',
    },
    {
      billingKey: 'b-active-2',
      projectKey: 'p-active',
      clientKey: 'c1',
      amount: grossFromNet(30_000),
      paymentDate: day(-5),
      reference: 'REC-1003',
    },
    {
      billingKey: 'b-done-1',
      projectKey: 'p-done',
      clientKey: 'c4',
      amount: grossFromNet(96_000),
      paymentDate: day(-70),
      reference: 'REC-2001',
    },
    {
      billingKey: 'b-active2-1',
      projectKey: 'p-active-2',
      clientKey: 'c2',
      amount: grossFromNet(25_000),
      paymentDate: day(-7),
      reference: 'REC-3001',
    },
  ];

  const vendorBills: DemoFixtureVendorBill[] = [
    {
      key: 'ap-1',
      projectKey: 'p-active',
      vendorKey: 'v-sub-1',
      reference: `AP-${profileKey.slice(0, 4)}-01`,
      netAmount: money(18_500),
      grossAmount: grossFromNet(18_500),
      taxAmount: taxFromNet(18_500),
      billDate: day(-22),
    },
    {
      key: 'ap-2',
      projectKey: 'p-hold',
      vendorKey: 'v-supplier-2',
      reference: `AP-${profileKey.slice(0, 4)}-02`,
      netAmount: money(9_200),
      grossAmount: grossFromNet(9_200),
      taxAmount: taxFromNet(9_200),
      billDate: day(-16),
    },
    {
      key: 'ap-3',
      projectKey: 'p-active-2',
      vendorKey: 'v-sub-2',
      reference: `AP-${profileKey.slice(0, 4)}-03`,
      netAmount: money(6_400),
      grossAmount: grossFromNet(6_400),
      taxAmount: taxFromNet(6_400),
      billDate: day(-9),
    },
  ];

  const contracts: DemoFixtureContract[] = [
    {
      key: 'ct-primary',
      projectKey: 'p-active',
      clientKey: 'c1',
      name: `הסכם ${noun} ראשי`,
      originalValueNet: money(420_000),
      startDate: day(-120),
    },
    {
      key: 'ct-secondary',
      projectKey: 'p-active-2',
      clientKey: 'c2',
      name: `הסכם משלים — ${domain}`,
      originalValueNet: money(145_000),
      startDate: day(-45),
    },
    {
      key: 'ct-closed',
      projectKey: 'p-done',
      clientKey: 'c4',
      name: `הסכם שהסתיים`,
      originalValueNet: money(210_000),
      startDate: day(-280),
    },
  ];

  const taskStatuses: DemoFixtureTaskStatus[] = [
    'todo',
    'in_progress',
    'in_review',
    'blocked',
    'done',
    'todo',
    'in_progress',
    'done',
    'todo',
    'in_progress',
    'done',
    'blocked',
  ];
  const taskProjects = ['p-active', 'p-active', 'p-active-2', 'p-hold', 'p-service', 'p-active', 'p-active-2', 'p-done', 'p-pipeline', 'p-active', 'p-service', 'p-hold'];
  const tasks = taskProjects.map((projectKey, index) => {
    const status = taskStatuses[index % taskStatuses.length]!;
    const opened = day(-10 + index);
    const due = day(3 + index * 2);
    const completion =
      status === 'done' ? day(-2 + index) : undefined;
    return {
      title: `משימה ${index + 1} — ${noun}`,
      projectKey,
      status,
      startDate: opened,
      dueDate: due,
      completionDate: completion,
    };
  });

  const fieldEmployees = ['e3', 'e2', 'e6', 'e3', 'e2', 'e4', 'e3'];
  const timeProjects = ['p-active', 'p-active', 'p-active-2', 'p-service', 'p-active-2', 'p-active', 'p-active'];
  const timeEntries: DemoFixtureTimeEntry[] = fieldEmployees.map((employeeKey, index) => ({
    employeeKey,
    projectKey: timeProjects[index]!,
    workDate: day(-index),
    hours: (7.5 + (index % 2)).toFixed(2),
    description: `דיווח שעות שטח — ${domain}`,
  }));

  const attendanceDates = [day(-4), day(-3), day(-2), day(-1), day(0)];

  const documents = documentNamesForProfile(profileKey, noun).map((fileName, index) => ({
    fileName,
    projectKey: [ 'p-active', 'p-active-2', 'p-hold' ][index % 3]!,
  }));

  const boqItems = profileUsesBoq(profileKey)
    ? [1, 2, 3, 4].map((n) => ({
        description: `סעיף ${n} — ${noun} (${domain})`,
        projectKey: n <= 2 ? 'p-active' : 'p-active-2',
        unitPrice: money(1_200 * n),
      }))
    : [];

  return {
    profileKey,
    organizationName: `${domain} — דמו מקצועי`,
    anchorDay: day(0),
    clients: roster.clients,
    employees: roster.employees,
    vendors: roster.vendors,
    projects,
    tasks,
    expenses,
    billing,
    contracts,
    payments,
    vendorBills,
    timeEntries,
    documents,
    boqItems,
    attendanceDates,
  };
}

export function activeProjectContractNet(fixture: DemoFixture): string {
  const total = fixture.billing
    .filter((row) => row.projectKey === 'p-active')
    .reduce((sum, row) => sum + Number(row.subtotalAmount), 0);
  return total.toFixed(2);
}

export function activeProjectCostNet(fixture: DemoFixture): string {
  const total = fixture.expenses
    .filter((row) => row.projectKey === 'p-active')
    .reduce((sum, row) => sum + Number(row.netAmount), 0);
  return total.toFixed(2);
}

export function collectFixtureDateStrings(fixture: DemoFixture): string[] {
  const dates: string[] = [fixture.anchorDay];
  for (const project of fixture.projects) {
    dates.push(project.startedDate);
  }
  dates.push(...fixture.attendanceDates);
  for (const row of fixture.expenses) dates.push(row.expenseDate);
  for (const row of fixture.billing) dates.push(row.issueDate);
  for (const row of fixture.contracts) dates.push(row.startDate);
  for (const row of fixture.payments) dates.push(row.paymentDate);
  for (const row of fixture.vendorBills) dates.push(row.billDate);
  for (const row of fixture.timeEntries) dates.push(row.workDate);
  for (const row of fixture.tasks) {
    if (row.startDate) dates.push(row.startDate);
    if (row.dueDate) dates.push(row.dueDate);
    if (row.completionDate) dates.push(row.completionDate);
  }
  return dates;
}

export const DEMO_FIXTURE_KEYS = ONBOARDING_BUSINESS_TYPES;