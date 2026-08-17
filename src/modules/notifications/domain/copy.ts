import type { NotificationEventType } from './types';

function he(locale: string): boolean {
  return locale.toLowerCase().startsWith('he');
}

export function notificationCopy(
  locale: string,
  type: NotificationEventType,
  input: { readonly reference?: string | null; readonly extra?: string | null },
): { title: string; body: string } {
  const ref = input.reference?.trim() || null;
  const extra = input.extra?.trim() || null;

  if (he(locale)) {
    switch (type) {
      case 'billing_overdue':
        return {
          title: ref ? `חיוב לקוח באיחור - ${ref}` : 'חיוב לקוח באיחור',
          body: extra ? `יתרה פתוחה · ${extra}` : 'חיוב סופי עם יתרה שטרם נפרעה.',
        };
      case 'ap_due_soon':
        return {
          title: ref ? `חשבון ספק מתקרב לפירעון - ${ref}` : 'חשבון ספק מתקרב לפירעון',
          body: extra ? `לתשלום עד ${extra}` : 'פירעון בתוך שבעה ימים.',
        };
      case 'ap_overdue':
        return {
          title: ref ? `חשבון ספק באיחור - ${ref}` : 'חשבון ספק באיחור',
          body: extra ? `עבר את מועד הפירעון ${extra}` : 'חשבון ספק שעבר את מועד הפירעון.',
        };
      case 'approval_waiting':
        return {
          title: 'ממתין לאישור',
          body: ref ? `${ref} ממתין להחלטה.` : 'בקשה ממתינה לאישור.',
        };
      case 'timesheet_waiting':
        return {
          title: 'גיליון שעות ממתין',
          body: extra ? `תקופה ${extra}` : 'גיליון שעות הוגש וממתין לאישור.',
        };
      case 'employee_missing_report':
        return {
          title: 'חסר דיווח שעות',
          body: 'חסר דיווח נדרש לעובד.',
        };
      case 'document_expiring':
        return {
          title: ref ? `מסמך שפג תוקף בקרוב - ${ref}` : 'מסמך שפג תוקף בקרוב',
          body: extra ? `תוקף עד ${extra}` : 'יש לחדש או להחליף את המסמך.',
        };
      case 'task_overdue':
        return {
          title: ref ? `משימה באיחור - ${ref}` : 'משימה באיחור',
          body: extra ? `יעד ${extra}` : 'פריט תכנון שעבר את תאריך היעד.',
        };
      case 'boq_awaiting_approval':
        return {
          title: 'כתב כמויות ממתין לאישור',
          body: extra ? extra : 'אצוות מדידה ממתינה לאישור.',
        };
      case 'work_order_assigned':
        return {
          title: ref ? `שובצת לקריאת שירות - ${ref}` : 'שובצת לקריאת שירות',
          body: 'קריאת שירות שויכה אליך.',
        };
      case 'punch_assigned':
        return {
          title: ref ? `שובצת לפריט תיקון - ${ref}` : 'שובצת לפריט תיקון',
          body: 'פריט תיקון שויך אליך.',
        };
      case 'low_stock':
        return {
          title: ref ? `מלאי נמוך - ${ref}` : 'מלאי נמוך',
          body: extra ? extra : 'הכמות במלאי ירדה מתחת לסף.',
        };
      case 'safety_action_due':
        return {
          title: ref ? `פעולת בטיחות לטיפול - ${ref}` : 'פעולת בטיחות לטיפול',
          body: extra ? `יעד ${extra}` : 'פעולה מתקנת שעברה את המועד.',
        };
      case 'warranty_expiring':
        return {
          title: ref ? `אחריות שעומדת לפוג - ${ref}` : 'אחריות שעומדת לפוג',
          body: extra ? `תוקף עד ${extra}` : 'כיסוי אחריות מתקרב לסיום.',
        };
      case 'closeout_blockers':
        return {
          title: ref ? `סגירת פרויקט חסומה - ${ref}` : 'סגירת פרויקט חסומה',
          body: extra ?? 'יש פריטים שחוסמים סגירה מסודרת.',
        };
      case 'communication_failed':
        return {
          title: ref ? `הודעה לא נשלחה - ${ref}` : 'הודעה לא נשלחה',
          body: extra ?? 'השליחה נכשלה או לא אושרה על ידי הספק.',
        };
      case 'automation_output':
        return {
          title: ref ? `אוטומציה דורשת מעקב - ${ref}` : 'אוטומציה דורשת מעקב',
          body: extra ?? 'ריצת אוטומציה נכשלה או הפיקה פלט לטיפול.',
        };
    }
  }

  switch (type) {
    case 'billing_overdue':
      return {
        title: ref ? `Overdue customer billing - ${ref}` : 'Overdue customer billing',
        body: extra ? `Outstanding ${extra}` : 'Finalized billing still has an outstanding balance.',
      };
    case 'ap_due_soon':
      return {
        title: ref ? `Vendor bill due soon - ${ref}` : 'Vendor bill due soon',
        body: extra ? `Due ${extra}` : 'Due within seven days.',
      };
    case 'ap_overdue':
      return {
        title: ref ? `Vendor bill overdue - ${ref}` : 'Vendor bill overdue',
        body: extra ? `Past due since ${extra}` : 'Vendor bill is past its due date.',
      };
    case 'approval_waiting':
      return {
        title: 'Waiting for approval',
        body: ref ? `${ref} is waiting for a decision.` : 'A request is waiting for approval.',
      };
    case 'timesheet_waiting':
      return {
        title: 'Timesheet waiting',
        body: extra ? `Period ${extra}` : 'A submitted timesheet is waiting for approval.',
      };
    case 'employee_missing_report':
      return {
        title: 'Missing time report',
        body: 'A required employee report is missing.',
      };
    case 'document_expiring':
      return {
        title: ref ? `Document expiring - ${ref}` : 'Document expiring',
        body: extra ? `Expires ${extra}` : 'Renew or replace this document.',
      };
    case 'task_overdue':
      return {
        title: ref ? `Overdue task - ${ref}` : 'Overdue task',
        body: extra ? `Target ${extra}` : 'A planning item is past its target date.',
      };
    case 'boq_awaiting_approval':
      return {
        title: 'BOQ awaiting approval',
        body: extra ?? 'A progress measurement batch is waiting for approval.',
      };
    case 'work_order_assigned':
      return {
        title: ref ? `Work order assigned - ${ref}` : 'Work order assigned',
        body: 'A work order was assigned to you.',
      };
    case 'punch_assigned':
      return {
        title: ref ? `Punch item assigned - ${ref}` : 'Punch item assigned',
        body: 'A punch list item was assigned to you.',
      };
    case 'low_stock':
      return {
        title: ref ? `Low stock - ${ref}` : 'Low stock',
        body: extra ?? 'On-hand quantity is at or below the reorder threshold.',
      };
    case 'safety_action_due':
      return {
        title: ref ? `Safety action due - ${ref}` : 'Safety action due',
        body: extra ? `Due ${extra}` : 'A corrective action is past due.',
      };
    case 'warranty_expiring':
      return {
        title: ref ? `Warranty ending - ${ref}` : 'Warranty ending',
        body: extra ? `Ends ${extra}` : 'Warranty coverage is near its end date.',
      };
    case 'closeout_blockers':
      return {
        title: ref ? `Closeout blocked - ${ref}` : 'Closeout blocked',
        body: extra ?? 'Blocking items remain before the project can close.',
      };
    case 'communication_failed':
      return {
        title: ref ? `Message not sent - ${ref}` : 'Message not sent',
        body: extra ?? 'Delivery failed or was not confirmed by the provider.',
      };
    case 'automation_output':
      return {
        title: ref ? `Automation needs follow-up - ${ref}` : 'Automation needs follow-up',
        body: extra ?? 'An automation run failed or produced output to review.',
      };
  }
}
