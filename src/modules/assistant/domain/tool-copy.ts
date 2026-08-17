import type { AssistantToolKey } from './types';

function he(locale: string): boolean {
  return locale.toLowerCase().startsWith('he');
}

export function assistantDeniedBody(locale: string): string {
  return he(locale) ? 'אין הרשאה לפעולה הזו.' : 'You do not have permission for this.';
}

export function assistantToolTitle(locale: string, tool: AssistantToolKey): string {
  if (he(locale)) {
    switch (tool) {
      case 'today_attention':
        return 'היום';
      case 'explain_project_profit':
        return 'רווח פרויקט';
      case 'clients_owing_money':
        return 'לקוחות עם יתרה';
      case 'pay_this_week':
        return 'לתשלום השבוע';
      case 'projects_at_risk':
        return 'פרויקטים בסיכון';
      case 'supplier_bills_needing_review':
        return 'חשבוניות ספק לבדיקה';
      case 'forecast_over_budget':
        return 'תחזית מעל התקציב';
      case 'explain_number':
        return 'הסבר מספר';
      case 'find_document':
        return 'מסמכים';
      case 'prepare_draft_expense':
        return 'טיוטת הוצאה';
      case 'prepare_payment_reminder_draft':
        return 'טיוטת תזכורת תשלום';
    }
  }
  switch (tool) {
    case 'today_attention':
      return 'Today';
    case 'explain_project_profit':
      return 'Project profit';
    case 'clients_owing_money':
      return 'Clients owing money';
    case 'pay_this_week':
      return 'Pay this week';
    case 'projects_at_risk':
      return 'Projects at risk';
    case 'supplier_bills_needing_review':
      return 'Supplier bills needing review';
    case 'forecast_over_budget':
      return 'Forecast over budget';
    case 'explain_number':
      return 'Explain a number';
    case 'find_document':
      return 'Documents';
    case 'prepare_draft_expense':
      return 'Draft expense';
    case 'prepare_payment_reminder_draft':
      return 'Payment reminder draft';
  }
}

export function warningKindLabel(locale: string, kind: string): string {
  if (he(locale)) {
    switch (kind) {
      case 'actual_over_budget':
        return 'עלות בפועל מעל התקציב';
      case 'projected_cost_over_budget':
        return 'תחזית עלות מעל התקציב';
      case 'insufficient_remaining_budget':
        return 'תקציב שנותר אינו מספיק';
      case 'forecast_margin_negative':
        return 'מרווח תחזית שלילי';
      case 'margin_deterioration':
        return 'שחיקת מרווח';
      case 'commitment_pressure':
        return 'לחץ מהתחייבויות';
      case 'billing_lag':
        return 'פיגור בחיוב';
      case 'collection_risk':
        return 'סיכון גבייה';
      case 'high_consumption_vs_progress':
        return 'צריכה גבוהה מול התקדמות';
      case 'missing_data':
        return 'חסרים נתונים';
      default:
        return kind;
    }
  }
  switch (kind) {
    case 'actual_over_budget':
      return 'Actual cost over budget';
    case 'projected_cost_over_budget':
      return 'Forecast cost over budget';
    case 'insufficient_remaining_budget':
      return 'Remaining budget is not enough';
    case 'forecast_margin_negative':
      return 'Negative forecast margin';
    case 'margin_deterioration':
      return 'Margin deterioration';
    case 'commitment_pressure':
      return 'Commitment pressure';
    case 'billing_lag':
      return 'Billing lag';
    case 'collection_risk':
      return 'Collection risk';
    case 'high_consumption_vs_progress':
      return 'High consumption vs progress';
    case 'missing_data':
      return 'Missing data';
    default:
      return kind;
  }
}

export const assistantToolCopy = {
  todayEmpty: (locale: string) =>
    he(locale) ? 'אין פריטים לטיפול בהיום.' : 'No Today items in the current inbox.',
  profitNeedProject: (locale: string) =>
    he(locale)
      ? 'ציינו פרויקט כדי להסביר רווח מהנתונים הקיימים.'
      : 'Name a project to explain profit from composed financials.',
  profitNotSet: (locale: string) =>
    he(locale) ? 'לא הוגדר מחיר. לא מחושב רווח.' : 'Price is not set. Profit is not claimed.',
  profitHidden: (locale: string) =>
    he(locale)
      ? 'הרווח אינו זמין לצופה הזה או לפרויקט הזה.'
      : 'Profit is not available for this viewer or project.',
  profitBody: (locale: string, forecast: string, actual: string, currency: string) =>
    he(locale)
      ? `מרווח תחזית ${forecast} ${currency}. מרווח בפועל ${actual} ${currency}.`
      : `Forecast margin ${forecast} ${currency}. Actual margin ${actual} ${currency}.`,
  clientsEmpty: (locale: string) =>
    he(locale) ? 'אין חיובים באיחור ברשימה הזו.' : 'No overdue billing records in this list.',
  payEmpty: (locale: string) =>
    he(locale)
      ? 'אין חשבוניות ספק לפירעון השבוע עם תאריך רשום.'
      : 'No supplier bills due this week with a recorded due date.',
  riskEmpty: (locale: string) =>
    he(locale) ? 'אין אזהרות מוקדמות לצופה הזה.' : 'No early-warning rows for this viewer.',
  billsEmpty: (locale: string) =>
    he(locale) ? 'אין חשבוניות ספק בטיוטה ברשימה הזו.' : 'No draft supplier bills in this list.',
  billsCount: (locale: string, count: number) =>
    he(locale) ? `${count} חשבוניות ספק בטיוטה.` : `${count} draft supplier bills.`,
  explainNumber: (locale: string) =>
    he(locale)
      ? 'פתחו את הפרויקט, החיוב או ההוצאה. המספרים מגיעים מהפיננסים הקיימים - העוזר לא מחשב מחדש.'
      : 'Open the related project, bill, or expense. Figures come from existing financials — this assistant does not recalculate them.',
  documentsEmpty: (locale: string) =>
    he(locale)
      ? 'לא נמצאו מסמכים. החיפוש משתמש רק ברשומות שמותר לכם לראות.'
      : 'No documents matched. Search uses records you can already see.',
  draftExpense: (locale: string) =>
    he(locale)
      ? 'לא נוצרה הוצאה. פתחו הוצאה חדשה כדי להכין טיוטה. לא נרשם דבר.'
      : 'No expense was created. Open a new expense to prepare a draft. Nothing was posted.',
  draftReminder: (locale: string) =>
    he(locale)
      ? 'לא נוצרה הודעה. פתחו הודעה חדשה כדי להכין תזכורת. לא נשלח דבר.'
      : 'No message was created. Open Messages to prepare a payment reminder draft. Nothing was sent.',
  financialsLabel: (locale: string) => (he(locale) ? 'פיננסים לפרויקט' : 'Project financials'),
  expensesLabel: (locale: string) => (he(locale) ? 'הוצאה חדשה' : 'New expense'),
  reminderLabel: (locale: string) => (he(locale) ? 'תזכורת תשלום' : 'Payment reminder'),
  messagesLabel: (locale: string) => (he(locale) ? 'הודעות' : 'Messages'),
};
