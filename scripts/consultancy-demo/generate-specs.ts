import { mulberry32, pick, intBetween, amountBetween, pickWeighted } from './rng.ts';

export type ProjectBucket =
  | 'early'
  | 'detailed'
  | 'coordination'
  | 'construction'
  | 'tender'
  | 'waiting'
  | 'handover'
  | 'completed';

export interface ClientSpec {
  readonly key: string;
  readonly name: string;
  readonly city: string;
  readonly paymentTermKey: string;
  readonly clientType: string;
}

export interface ProjectSpec {
  readonly docNum: string;
  readonly name: string;
  readonly clientKey: string;
  readonly location: string;
  readonly bucket: ProjectBucket;
  readonly stageIndex: number;
  readonly contractNet: string;
  readonly billedPct: number;
  readonly collectedPct: number;
  readonly taskCount: number;
  readonly activity: 'high' | 'medium' | 'low' | 'waiting' | 'done';
  readonly startDate: string;
}

const FEATURED_PROJECTS: readonly { name: string; location: string; tier: 'small' | 'medium' | 'large' | 'major' }[] = [
  { name: 'מגדלי פארק — מגדל מגורים 28 קומות', location: 'פתח תקווה', tier: 'major' },
  { name: 'רובע הגנים — 420 יח"ד', location: 'ראשון לציון', tier: 'major' },
  { name: 'קמפוס טכנולוגי נאות', location: 'נאות הדר', tier: 'large' },
  { name: 'מרכז לוגיסטי שוהם', location: 'שוהם', tier: 'large' },
  { name: 'בית ספר הדרים', location: 'הוד השרון', tier: 'medium' },
  { name: 'מרכז מסחרי צפון', location: 'חיפה', tier: 'large' },
  { name: 'מגדל משרדים ספיר', location: 'תל אביב', tier: 'large' },
  { name: 'מפעל תעשיות אופק', location: 'עפולה', tier: 'large' },
  { name: 'מלון החוף', location: 'אשדוד', tier: 'medium' },
  { name: 'חניון עירוני מרכז', location: 'רמת גן', tier: 'medium' },
  { name: 'שכונת נחל — תשתיות ופיתוח', location: 'מודיעין', tier: 'major' },
  { name: 'פרויקט EV פארק עסקים', location: 'לוד', tier: 'medium' },
  { name: 'משרדי חברת טכנולוגיה — 8 קומות', location: 'הרצליה', tier: 'medium' },
  { name: 'בית דיור מוגן השרון', location: 'רעננה', tier: 'medium' },
  { name: 'מרכז רפואי יום', location: 'כפר סבא', tier: 'small' },
  { name: 'מתחם מסחר ותחנת דלק', location: 'באר שבע', tier: 'medium' },
  { name: 'בית תרבות עירוני', location: 'קריית אונו', tier: 'small' },
  { name: 'מחסן אוטומטי — מרלו"ג', location: 'אשקלון', tier: 'large' },
  { name: 'שיפוץ מלון עירוני', location: 'טבריה', tier: 'medium' },
  { name: 'תאורת רחובות — רובע מזרח', location: 'נתניה', tier: 'small' },
];

const CLIENT_NAMES = [
  'אבני העיר יזמות בע"מ',
  'פסגת נדל"ן ישראל בע"מ',
  'ארבל אדריכלים',
  'קו ראשון אדריכלות',
  'גנים פיתוח ובנייה בע"מ',
  'אורבן סיטי יזמות',
  'אפיק ניהול פרויקטים',
  'ברק הנדסה ובנייה',
  'מרום נכסים',
  'תעשיות אופק',
  'לוגיסטק ישראל',
  'מרכזים מסחריים השרון',
  'נתיבי מטרופולין פיתוח',
  'מועצה אזורית דמו',
  'עיריית נאות הדר',
  'קבוצת מגדלי פארק',
  'שדות מגורים',
  'לב העיר נכסים',
  'קבוצת קמפוס',
  'אלון תעשיות',
  'הרימון יזמות ובנייה',
  'שקד נדל"ן מסחרי',
  'אופק בנייה ופיתוח',
  'מגדלי הים התיכון',
  'נוף גבעה אדריכלים',
  'עמק יzreel פיתוח',
  'כרמל מסחר ותעסוקה',
  'גליל עליון יזמות',
  'שדרות העיר חברה כלכלית',
  'מעוזי בנייה ותשתיות',
  'אור ים נכסים',
  'רם אדריכלות ותכנון',
  'פארק תעשייה דרומי',
  'מגורים+ יזמות עירונית',
  'אחוזות הדרים',
  'בניה מתקדמת בע"מ',
  'נאות סביון פיתוח',
  'עמק חפר מועצה אזורית דמו',
  'מגדלי הזהב יזמות',
  'אפיקים הנדסה וניהול',
  'שוהם פרויקטים',
  'נווה נכסים ופיתוח',
  'פסגת ייזום ובנייה',
  'ארבל הנדסה וביצוע',
  'מישור בנייה ופיתוח',
] as const;

const CITIES = [
  'תל אביב', 'ראשון לציון', 'חולון', 'פתח תקווה', 'רמת גן', 'הרצליה', 'נתניה',
  'חיפה', 'ירושלים', 'באר שבע', 'אשדוד', 'מודיעין', 'רחובות', 'כפר סבא', 'רעננה',
] as const;

const PAYMENT_TERMS = ['net_30', 'eom_30', 'eom_45', 'eom_60', 'eom_90'] as const;

const PREFIXES = ['מתחם', 'פרויקט', 'שכונת', 'מרכז', 'מגדל', 'קמפוס', 'מתחם', 'בית', 'מפעל', 'חניון'] as const;
const SUBJECTS = [
  'מגורים', 'משרדים', 'מסחר', 'לוגיסטיקה', 'תעשייה', 'מלונאות', 'חינוך', 'תשתיות',
  'תאורה', 'אנרגיה', 'דיור מוגן', 'קמעונאות', 'מבנה ציבור', 'שדרוג טכנולוגי',
] as const;
const SUFFIXES = ['צפון', 'דרום', 'מרכז', 'גן', 'הר', 'נוף', 'ים', 'פארק', 'עמק', 'הגבעה'] as const;

const BUCKET_DIST: readonly { bucket: ProjectBucket; count: number; stageIndex: number; activity: ProjectSpec['activity'] }[] = [
  { bucket: 'early', count: 25, stageIndex: 2, activity: 'medium' },
  { bucket: 'detailed', count: 35, stageIndex: 3, activity: 'high' },
  { bucket: 'coordination', count: 20, stageIndex: 4, activity: 'medium' },
  { bucket: 'construction', count: 30, stageIndex: 8, activity: 'high' },
  { bucket: 'tender', count: 12, stageIndex: 6, activity: 'medium' },
  { bucket: 'waiting', count: 10, stageIndex: 5, activity: 'waiting' },
  { bucket: 'handover', count: 8, stageIndex: 10, activity: 'medium' },
  { bucket: 'completed', count: 10, stageIndex: 11, activity: 'done' },
];

function tierAmount(rng: () => number, tier: 'small' | 'medium' | 'large' | 'major'): string {
  switch (tier) {
    case 'small':
      return amountBetween(rng, 15000, 45000);
    case 'medium':
      return amountBetween(rng, 50000, 150000);
    case 'large':
      return amountBetween(rng, 160000, 400000);
    case 'major':
      return amountBetween(rng, 450000, 900000);
  }
}

function bucketTier(rng: () => number, bucket: ProjectBucket): 'small' | 'medium' | 'large' | 'major' {
  if (bucket === 'completed' || bucket === 'waiting') {
    return pickWeighted(rng, [
      { value: 'small' as const, weight: 3 },
      { value: 'medium' as const, weight: 4 },
      { value: 'large' as const, weight: 2 },
      { value: 'major' as const, weight: 1 },
    ]);
  }
  return pickWeighted(rng, [
    { value: 'small' as const, weight: 2 },
    { value: 'medium' as const, weight: 4 },
    { value: 'large' as const, weight: 3 },
    { value: 'major' as const, weight: 2 },
  ]);
}

function taskCountForActivity(activity: ProjectSpec['activity'], rng: () => number): number {
  switch (activity) {
    case 'high':
      return intBetween(rng, 20, 40);
    case 'medium':
      return intBetween(rng, 8, 18);
    case 'low':
      return intBetween(rng, 5, 10);
    case 'waiting':
      return intBetween(rng, 2, 5);
    case 'done':
      return intBetween(rng, 6, 14);
  }
}

function billingPct(bucket: ProjectBucket, rng: () => number): number {
  if (bucket === 'completed') return intBetween(rng, 85, 100);
  if (bucket === 'early') return intBetween(rng, 0, 25);
  if (bucket === 'waiting') return intBetween(rng, 20, 55);
  if (bucket === 'handover') return intBetween(rng, 70, 95);
  return intBetween(rng, 25, 85);
}

export function generateClients(): ClientSpec[] {
  const rng = mulberry32(42);
  return CLIENT_NAMES.map((name, index) => ({
    key: `c${index + 1}`,
    name,
    city: pick(rng, CITIES),
    paymentTermKey: pick(rng, PAYMENT_TERMS),
    clientType: pick(rng, ['developer', 'contractor', 'architect', 'pm', 'commercial', 'industrial', 'municipal', 'owner']),
  }));
}

export function generateProjects(clients: ClientSpec[]): ProjectSpec[] {
  const rng = mulberry32(20260101);
  const projects: ProjectSpec[] = [];
  let docCounter = 27001;
  let featuredIdx = 0;

  for (const row of BUCKET_DIST) {
    for (let i = 0; i < row.count; i += 1) {
      const client = pick(rng, clients);
      let name: string;
      let location: string;
      let tier: 'small' | 'medium' | 'large' | 'major';

      if (featuredIdx < FEATURED_PROJECTS.length && row.bucket !== 'completed') {
        const featured = FEATURED_PROJECTS[featuredIdx]!;
        featuredIdx += 1;
        name = featured.name;
        location = featured.location;
        tier = featured.tier;
      } else {
        name = `${pick(rng, PREFIXES)} ${pick(rng, SUBJECTS)} ${pick(rng, SUFFIXES)}`;
        location = pick(rng, CITIES);
        tier = bucketTier(rng, row.bucket);
      }

      const contractNet = tierAmount(rng, tier);
      const billedPct = billingPct(row.bucket, rng);
      const collectedPct = Math.max(0, billedPct - intBetween(rng, 0, row.bucket === 'waiting' ? 35 : 20));
      const month = intBetween(rng, 1, 9);
      const day = intBetween(rng, 1, 26);
      const startDate = `2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

      projects.push({
        docNum: String(docCounter++),
        name,
        clientKey: client.key,
        location,
        bucket: row.bucket,
        stageIndex: row.stageIndex,
        contractNet,
        billedPct,
        collectedPct,
        taskCount: taskCountForActivity(row.activity, rng),
        activity: row.activity,
        startDate,
      });
    }
  }

  return projects;
}

export const TASK_TITLES = [
  'קבלת תוכניות אדריכלות מעודכנות',
  'הכנת חישוב עומסים',
  'תכנון חדר חשמל',
  'הכנת תרשים חד-קווי',
  'תכנון לוחות',
  'בדיקת מפל מתח',
  'תכנון תאורת חירום',
  'תכנון תאורת חוץ',
  'תיאום עם יועץ מיזוג',
  'תיאום עם יועץ אינסטלציה',
  'תיאום עם אדריכל',
  'בדיקת מיקום פירים',
  'תכנון תשתיות תקשורת',
  'הכנת כתב כמויות',
  'הכנת מפרט טכני',
  'הוצאת סט למכרז',
  'מענה לשאלות קבלנים',
  'בדיקת הצעות',
  'בדיקת Shop Drawings',
  'בדיקת לוחות לאישור',
  'ביקור פיקוח באתר',
  'הפקת דו"ח פיקוח',
  'מעקב תיקון ליקויים',
  'בדיקת חשבון קבלן',
  'בדיקת As Made',
  'הכנת תיק מסירה',
  'תיאום חברת חשמל',
  'תיאום בזק/תקשורת',
  'תיאום גנרטור',
  'תיאום מערכת UPS',
  'עדכון תוכניות בעקבות שינוי אדריכלות',
  'הכנת לוח חלוקה ראשי',
  'בדיקת תאימות לתקן',
  'עדכון BIM',
  'הכנת מפרט תאורה',
] as const;

export const DECISION_TITLES = [
  'חדר החשמל יועבר לקומה מינוס 1',
  'הוחלט להגדיל הזנה ראשית ל-1600A',
  'הגנרטור יעבור לגג',
  'נדרש עדכון תוכנית אדריכלות לפני המשך תכנון',
  'יזם אישר תוספת תכנון עמדות טעינה',
  'תכנון תאורה ציבורית יעבור לחלופה B',
  'יושם פתרון UPS מרכזי',
  'אושר שינוי מיקום לוח ראשי',
] as const;

export const MILESTONE_NAMES = [
  'תכנון מוקדם',
  'סט 50%',
  'סט 80%',
  'סט למכרז',
  'סט לביצוע',
  'אישור חברת חשמל',
  'תחילת ביצוע',
  'מסירה ראשונית',
  'מסירה סופית',
] as const;
