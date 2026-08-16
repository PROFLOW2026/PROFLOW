import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = join(process.cwd(), 'public', 'marketing', 'screenshots');

function chrome(title, sidebarActive) {
  const nav = ['היום', 'פרויקטים', 'לקוחות', 'ספקים', 'דוחות']
    .map((label, i) => {
      const y = 148 + i * 34;
      const active = label === sidebarActive;
      return `<rect x="40" y="${y - 16}" width="168" height="28" rx="6" fill="${active ? '#0F766E' : '#fff'}" fill-opacity="${active ? 0.12 : 0}"/>
  <text x="52" y="${y}" fill="${active ? '#0F766E' : '#4B5563'}" font-family="Assistant, Arial, sans-serif" font-size="13" font-weight="${active ? 700 : 500}">${label}</text>`;
    })
    .join('\n');

  return `
  <rect width="1280" height="800" fill="url(#bg)"/>
  <rect x="24" y="24" width="1232" height="44" rx="8" fill="#fff" stroke="#E2E6EB"/>
  <circle cx="48" cy="46" r="5" fill="#D1D5DB"/>
  <circle cx="66" cy="46" r="5" fill="#D1D5DB"/>
  <circle cx="84" cy="46" r="5" fill="#D1D5DB"/>
  <rect x="120" y="36" width="280" height="20" rx="6" fill="#F4F6F8"/>
  <text x="132" y="50" fill="#6B7280" font-family="Assistant, Arial, sans-serif" font-size="12">חיפוש בכל העסק</text>
  <rect x="24" y="84" width="200" height="692" rx="10" fill="#fff" stroke="#E2E6EB"/>
  <text x="44" y="118" fill="#0F766E" font-family="Assistant, Arial, sans-serif" font-size="16" font-weight="700">ProjectFlow</text>
  ${nav}
  <rect x="240" y="84" width="1016" height="56" rx="10" fill="#fff" stroke="#E2E6EB"/>
  <text x="264" y="118" fill="#111827" font-family="Assistant, Arial, sans-serif" font-size="20" font-weight="700">${title}</text>
`;
}

function wrap(aria, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="800" viewBox="0 0 1280 800" role="img" aria-label="${aria}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#F8FAFB"/>
      <stop offset="100%" stop-color="#EEF5F4"/>
    </linearGradient>
  </defs>
${body}
</svg>
`;
}

const files = {
  'pf-landing-sc-01-desktop.svg': wrap(
    'מסך היום ב-ProjectFlow',
    chrome('היום', 'היום') +
      `
  <text x="264" y="160" fill="#6B7280" font-family="Assistant, Arial, sans-serif" font-size="13">מה שדורש טיפול עכשיו</text>
  ${[
    ['אישור ממתין', 'פרויקט נווה צדק', 'גבוה'],
    ['חיוב באיחור', 'לקוח גולן', 'קריטי'],
    ['חשבון ספק לתשלום', 'ספק חומרים', 'בינוני'],
    ['אזהרת תקציב', 'שיפוץ דירה 14', 'גבוה'],
  ]
    .map((row, i) => {
      const y = 188 + i * 92;
      return `<rect x="240" y="${y}" width="1016" height="80" rx="10" fill="#fff" stroke="#E2E6EB"/>
  <rect x="256" y="${y + 18}" width="8" height="44" rx="4" fill="#0F766E"/>
  <text x="280" y="${y + 34}" fill="#111827" font-family="Assistant, Arial, sans-serif" font-size="15" font-weight="700">${row[0]}</text>
  <text x="280" y="${y + 56}" fill="#6B7280" font-family="Assistant, Arial, sans-serif" font-size="13">${row[1]}</text>
  <rect x="1120" y="${y + 26}" width="100" height="28" rx="6" fill="#FEF3C7"/>
  <text x="1170" y="${y + 45}" text-anchor="middle" fill="#92400E" font-family="Assistant, Arial, sans-serif" font-size="12">${row[2]}</text>`;
    })
    .join('\n')}
`,
  ),

  'pf-landing-sc-02-desktop.svg': wrap(
    'כספי פרויקט ב-ProjectFlow',
    chrome('כספי הפרויקט', 'פרויקטים') +
      `
  <text x="264" y="160" fill="#6B7280" font-family="Assistant, Arial, sans-serif" font-size="13">שיפוץ דירה 14 · חוזה נוכחי ₪420,000</text>
  ${[
    ['ערך הפרויקט', '₪420,000'],
    ['עלות בפועל', '₪286,400'],
    ['יתרה פתוחה', '₪74,200'],
    ['רווחיות צפויה', '18%'],
  ]
    .map((card, i) => {
      const x = 240 + i * 258;
      return `<rect x="${x}" y="188" width="246" height="120" rx="10" fill="#fff" stroke="${i === 0 ? '#B6E2DC' : '#E2E6EB'}"/>
  <text x="${x + 20}" y="224" fill="#6B7280" font-family="Assistant, Arial, sans-serif" font-size="13">${card[0]}</text>
  <text x="${x + 20}" y="268" fill="#111827" font-family="Assistant, Arial, sans-serif" font-size="26" font-weight="700">${card[1]}</text>`;
    })
    .join('\n')}
  <rect x="240" y="332" width="1016" height="420" rx="10" fill="#fff" stroke="#E2E6EB"/>
  <text x="264" y="372" fill="#111827" font-family="Assistant, Arial, sans-serif" font-size="15" font-weight="700">פירוט</text>
  ${['שינויים מאושרים', 'התחייבויות שכבר נעשו', 'חיוב ללקוח', 'תשלומים שהתקבלו']
    .map((label, i) => {
      const y = 404 + i * 56;
      return `<text x="264" y="${y}" fill="#374151" font-family="Assistant, Arial, sans-serif" font-size="14">${label}</text>
  <rect x="520" y="${y - 18}" width="700" height="14" rx="4" fill="#F4F6F8"/>`;
    })
    .join('\n')}
`,
  ),

  'pf-landing-sc-03-desktop.svg': wrap(
    'סביבת פרויקט ב-ProjectFlow',
    chrome('שיפוץ דירה 14', 'פרויקטים') +
      `
  <text x="264" y="160" fill="#6B7280" font-family="Assistant, Arial, sans-serif" font-size="13">לקוח גולן · פעיל</text>
  ${['סקירה', 'כספים', 'ספקים', 'עובדים', 'מסמכים', 'שטח']
    .map((tab, i) => {
      const x = 264 + i * 110;
      const active = i === 0;
      return `<text x="${x}" y="210" fill="${active ? '#0F766E' : '#6B7280'}" font-family="Assistant, Arial, sans-serif" font-size="13" font-weight="${active ? 700 : 500}">${tab}</text>
  ${active ? `<rect x="${x}" y="218" width="36" height="3" rx="2" fill="#0F766E"/>` : ''}`;
    })
    .join('\n')}
  ${[
    ['חוזה / ערך', '₪420,000'],
    ['עלות בפועל', '₪286,400'],
    ['התקדמות', '62%'],
    ['יתרה לגבייה', '₪74,200'],
  ]
    .map((card, i) => {
      const x = 240 + (i % 2) * 514;
      const y = 248 + Math.floor(i / 2) * 150;
      return `<rect x="${x}" y="${y}" width="502" height="132" rx="10" fill="#fff" stroke="#E2E6EB"/>
  <text x="${x + 24}" y="${y + 42}" fill="#6B7280" font-family="Assistant, Arial, sans-serif" font-size="13">${card[0]}</text>
  <text x="${x + 24}" y="${y + 86}" fill="#111827" font-family="Assistant, Arial, sans-serif" font-size="28" font-weight="700">${card[1]}</text>`;
    })
    .join('\n')}
  <rect x="240" y="560" width="1016" height="192" rx="10" fill="#fff" stroke="#E2E6EB"/>
  <text x="264" y="600" fill="#111827" font-family="Assistant, Arial, sans-serif" font-size="15" font-weight="700">פעילות אחרונה</text>
  <text x="264" y="640" fill="#4B5563" font-family="Assistant, Arial, sans-serif" font-size="13">חשבון התקדמות הוכן · יומן שטח עודכן · מסמך חוזה צורף</text>
`,
  ),

  'pf-landing-sc-04-desktop.svg': wrap(
    'בדיקת חשבונית ב-ProjectFlow',
    chrome('בדיקת חשבונית', 'פרויקטים') +
      `
  <rect x="240" y="168" width="420" height="560" rx="10" fill="#fff" stroke="#E2E6EB"/>
  <rect x="268" y="196" width="364" height="420" rx="8" fill="#F8FAFB" stroke="#E2E6EB"/>
  <text x="450" y="410" text-anchor="middle" fill="#9CA3AF" font-family="Assistant, Arial, sans-serif" font-size="14">תצוגת חשבונית</text>
  <text x="450" y="438" text-anchor="middle" fill="#9CA3AF" font-family="Assistant, Arial, sans-serif" font-size="13">צילום / קובץ</text>
  <rect x="688" y="168" width="568" height="560" rx="10" fill="#fff" stroke="#E2E6EB"/>
  <text x="712" y="208" fill="#111827" font-family="Assistant, Arial, sans-serif" font-size="16" font-weight="700">פרטים לאישור</text>
  ${[
    ['ספק', 'חומרי בניין דרום'],
    ['פרויקט', 'שיפוץ דירה 14'],
    ['הזמנת רכש', 'PO-1042'],
    ['סכום', '₪12,480'],
    ['אזהרה', 'חשבונית דומה כבר קיימת'],
  ]
    .map((row, i) => {
      const y = 248 + i * 72;
      return `<text x="712" y="${y}" fill="#6B7280" font-family="Assistant, Arial, sans-serif" font-size="12">${row[0]}</text>
  <text x="712" y="${y + 28}" fill="#111827" font-family="Assistant, Arial, sans-serif" font-size="15" font-weight="600">${row[1]}</text>`;
    })
    .join('\n')}
  <rect x="712" y="640" width="180" height="40" rx="8" fill="#0F766E"/>
  <text x="802" y="665" text-anchor="middle" fill="#fff" font-family="Assistant, Arial, sans-serif" font-size="14" font-weight="700">אישור טיוטה</text>
`,
  ),

  'pf-landing-sc-05-desktop.svg': wrap(
    'שינויים ב-ProjectFlow',
    chrome('שינויים', 'פרויקטים') +
      `
  ${[
    ['תוספת חשמל', 'ממתין', '₪18,500'],
    ['הפחתת ריצוף', 'מאושר', '-₪4,200'],
    ['תוספת אינסטלציה', 'מאושר', '₪9,800'],
  ]
    .map((row, i) => {
      const y = 168 + i * 120;
      const pending = row[1] === 'ממתין';
      return `<rect x="240" y="${y}" width="1016" height="100" rx="10" fill="#fff" stroke="#E2E6EB"/>
  <text x="264" y="${y + 40}" fill="#111827" font-family="Assistant, Arial, sans-serif" font-size="16" font-weight="700">${row[0]}</text>
  <text x="264" y="${y + 68}" fill="#6B7280" font-family="Assistant, Arial, sans-serif" font-size="13">שיפוץ דירה 14</text>
  <rect x="980" y="${y + 30}" width="100" height="28" rx="6" fill="${pending ? '#FEF3C7' : '#D1FAE5'}"/>
  <text x="1030" y="${y + 49}" text-anchor="middle" fill="${pending ? '#92400E' : '#065F46'}" font-family="Assistant, Arial, sans-serif" font-size="12">${row[1]}</text>
  <text x="1220" y="${y + 52}" text-anchor="end" fill="#111827" font-family="Assistant, Arial, sans-serif" font-size="16" font-weight="700">${row[2]}</text>`;
    })
    .join('\n')}
`,
  ),

  'pf-landing-sc-06-desktop.svg': wrap(
    'גבייה ב-ProjectFlow',
    chrome('חיובים ותשלומים', 'פרויקטים') +
      `
  ${[
    ['חויב', '₪345,800'],
    ['התקבל', '₪271,600'],
    ['פתוח', '₪74,200'],
  ]
    .map((card, i) => {
      const x = 240 + i * 346;
      return `<rect x="${x}" y="168" width="330" height="110" rx="10" fill="#fff" stroke="#E2E6EB"/>
  <text x="${x + 24}" y="208" fill="#6B7280" font-family="Assistant, Arial, sans-serif" font-size="13">${card[0]}</text>
  <text x="${x + 24}" y="250" fill="#111827" font-family="Assistant, Arial, sans-serif" font-size="26" font-weight="700">${card[1]}</text>`;
    })
    .join('\n')}
  <rect x="240" y="308" width="1016" height="420" rx="10" fill="#fff" stroke="#E2E6EB"/>
  <text x="264" y="348" fill="#111827" font-family="Assistant, Arial, sans-serif" font-size="15" font-weight="700">חיובים פתוחים</text>
  ${['חשבון חלקי 3', 'חשבון חלקי 4', 'חשבון שינויים']
    .map((label, i) => {
      const y = 390 + i * 70;
      return `<text x="264" y="${y}" fill="#374151" font-family="Assistant, Arial, sans-serif" font-size="14">${label}</text>
  <rect x="520" y="${y - 18}" width="700" height="14" rx="4" fill="#F4F6F8"/>`;
    })
    .join('\n')}
`,
  ),

  'pf-landing-sc-07-desktop.svg': wrap(
    'דוחות ב-ProjectFlow',
    chrome('דוחות ללקוח', 'דוחות') +
      `
  <text x="264" y="160" fill="#6B7280" font-family="Assistant, Arial, sans-serif" font-size="13">הפקה ללקוח בלי לפתוח גישה למערכת</text>
  ${[
    ['סטטוס פרויקט', 'סיכום מצב העבודה'],
    ['סיכום כספי', 'ערך, חיוב ויתרה'],
    ['התקדמות', 'מדידה וחשבונות'],
    ['שינויים', 'תוספות והפחתות'],
    ['יומן שטח', 'פעילות בשטח'],
    ['בדיקות וליקויים', 'סטטוס סגירה'],
  ]
    .map((card, i) => {
      const x = 240 + (i % 3) * 346;
      const y = 188 + Math.floor(i / 3) * 220;
      return `<rect x="${x}" y="${y}" width="330" height="190" rx="10" fill="#fff" stroke="#E2E6EB"/>
  <rect x="${x + 24}" y="${y + 28}" width="48" height="48" rx="10" fill="#0F766E" fill-opacity="0.12"/>
  <text x="${x + 24}" y="${y + 110}" fill="#111827" font-family="Assistant, Arial, sans-serif" font-size="16" font-weight="700">${card[0]}</text>
  <text x="${x + 24}" y="${y + 140}" fill="#6B7280" font-family="Assistant, Arial, sans-serif" font-size="13">${card[1]}</text>
  <text x="${x + 24}" y="${y + 168}" fill="#0F766E" font-family="Assistant, Arial, sans-serif" font-size="13" font-weight="600">הפקת PDF</text>`;
    })
    .join('\n')}
`,
  ),

  'pf-landing-sc-11-desktop.svg': wrap(
    'התראות פרויקט ב-ProjectFlow',
    chrome('אזהרות מוקדמות', 'פרויקטים') +
      `
  <text x="264" y="160" fill="#6B7280" font-family="Assistant, Arial, sans-serif" font-size="13">שיפוץ דירה 14</text>
  ${[
    ['הרווחיות נחלשת', 'מרווח התחזית ירד מול המרווח בפועל'],
    ['לחץ על התקציב', 'התחייבויות פתוחות לוחצות על היתרה'],
    ['עלויות גדלות', 'תחזית העלות גבוהה מהתקציב'],
    ['הגבייה מפגרת', 'יתרה פתוחה גבוהה ביחס לחיוב'],
  ]
    .map((row, i) => {
      const y = 188 + i * 110;
      return `<rect x="240" y="${y}" width="1016" height="92" rx="10" fill="#fff" stroke="#E2E6EB"/>
  <rect x="256" y="${y + 20}" width="10" height="52" rx="4" fill="#D97706"/>
  <text x="286" y="${y + 40}" fill="#111827" font-family="Assistant, Arial, sans-serif" font-size="16" font-weight="700">${row[0]}</text>
  <text x="286" y="${y + 68}" fill="#6B7280" font-family="Assistant, Arial, sans-serif" font-size="13">${row[1]}</text>`;
    })
    .join('\n')}
`,
  ),
};

for (const [name, svg] of Object.entries(files)) {
  writeFileSync(join(dir, name), svg, 'utf8');
  console.log('wrote', name);
}
