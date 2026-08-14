/** Locale-aware WHAT / WHY / WHERE fallbacks. Entity names stay as stored. */

function he(locale: string): boolean {
  return locale.toLowerCase().startsWith('he');
}

export function fallbackWhere(locale: string, key: 'billing' | 'vendorBills' | 'workforce' | 'approvals' | 'project' | 'assets' | 'monthClose' | 'boq'): string {
  if (he(locale)) {
    switch (key) {
      case 'billing':
        return 'חיוב';
      case 'vendorBills':
        return 'חשבונות ספק';
      case 'workforce':
        return 'עובדים · עלות מעסיק';
      case 'approvals':
        return 'אישורים';
      case 'project':
        return 'פרויקט';
      case 'assets':
        return 'ציוד';
      case 'monthClose':
        return 'סגירת חודש';
      case 'boq':
        return 'כתב כמויות';
    }
  }
  switch (key) {
    case 'billing':
      return 'Billing';
    case 'vendorBills':
      return 'Vendor bills';
    case 'workforce':
      return 'Workforce · employer cost';
    case 'approvals':
      return 'Approvals';
    case 'project':
      return 'Project';
    case 'assets':
      return 'Assets';
    case 'monthClose':
      return 'Month close';
    case 'boq':
      return 'BOQ';
  }
}

export function overdueArCopy(
  locale: string,
  input: { reference: string | null; dueDate: string | null; outstanding: string; currency: string },
): { what: string; why: string } {
  if (he(locale)) {
    return {
      what: input.reference ? `גבייה — ${input.reference}` : 'גביית חיוב באיחור',
      why: input.dueDate
        ? `באיחור מאז ${input.dueDate} · יתרה ${input.outstanding} ${input.currency}`
        : `באיחור · יתרה ${input.outstanding} ${input.currency}`,
    };
  }
  return {
    what: input.reference ? `Collect ${input.reference}` : 'Collect overdue billing',
    why: input.dueDate
      ? `Past due since ${input.dueDate} · outstanding ${input.outstanding} ${input.currency}`
      : `Past due · outstanding ${input.outstanding} ${input.currency}`,
  };
}

export function vendorBillDueCopy(
  locale: string,
  input: { reference: string | null; dueDate: string; outstanding: string; currency: string },
): { what: string; why: string } {
  if (he(locale)) {
    return {
      what: input.reference ? `תשלום חשבון ספק ${input.reference}` : 'תשלום חשבון ספק באיחור',
      why: `לתשלום עד ${input.dueDate} · יתרה ${input.outstanding} ${input.currency}`,
    };
  }
  return {
    what: input.reference ? `Pay vendor bill ${input.reference}` : 'Pay overdue vendor bill',
    why: `Due ${input.dueDate} · outstanding ${input.outstanding} ${input.currency}`,
  };
}

export function openAttendanceCopy(locale: string, workDate: string): { what: string; why: string } {
  if (he(locale)) {
    return {
      what: 'סגירת יום נוכחות פתוח',
      why: `נוכחות ב־${workDate} עדיין פתוחה (בלי יציאה / לא נסגרה)`,
    };
  }
  return {
    what: 'Close open attendance day',
    why: `Attendance for ${workDate} is still open (no clock-out / not closed)`,
  };
}

export function unallocatedEmployeeCostCopy(
  locale: string,
  input: { amount: string; currency: string; status: string },
): { what: string; why: string } {
  const status = allocationStatusLabel(locale, input.status);
  if (he(locale)) {
    return {
      what: 'הקצאת יתרת עלות עובד',
      why: `לא הוקצה ${input.amount} ${input.currency} בהקצאת עבודה (${status})`,
    };
  }
  return {
    what: 'Allocate employee cost remainder',
    why: `Unallocated ${input.amount} ${input.currency} on labor allocation (${status})`,
  };
}

export function unallocatedVendorBillCopy(
  locale: string,
  input: { outstanding: string; currency: string },
): { what: string; why: string } {
  if (he(locale)) {
    return {
      what: 'שיוך חשבון ספק לפרויקט',
      why: `חשבון פורסם בלי פרויקט · ${input.outstanding} ${input.currency}`,
    };
  }
  return {
    what: 'Assign vendor bill to a project',
    why: `Posted bill with no project · ${input.outstanding} ${input.currency}`,
  };
}

export function overBudgetCopy(
  locale: string,
  input: { actual: string; budget: string; currency: string; overBy: string },
): { what: string; why: string } {
  if (he(locale)) {
    return {
      what: 'בדיקת פרויקט שחרג מהתקציב',
      why: `בפועל ${input.actual} מעל תקציב ${input.budget} ${input.currency} (חריגה ${input.overBy})`,
    };
  }
  return {
    what: 'Review over-budget project',
    why: `Actual ${input.actual} exceeds budget ${input.budget} ${input.currency} (over by ${input.overBy})`,
  };
}

export function openApprovalCopy(
  locale: string,
  input: { entityType: string; amount: string | null; currency: string | null },
): { what: string; why: string } {
  const entity = entityTypeLabel(locale, input.entityType);
  const money =
    input.amount && input.currency ? ` · ${input.amount} ${input.currency}` : '';
  if (he(locale)) {
    return {
      what: 'החלטה על אישור ממתין',
      why: `${entity} ממתין להחלטה${money}`,
    };
  }
  return {
    what: 'Decide pending approval',
    why: `${entity} awaits decision${money}`,
  };
}

export function overduePlanningCopy(
  locale: string,
  input: { kind: string; targetEndDate: string; progressPercent: string },
): { what: string; why: string } {
  if (he(locale)) {
    return {
      what: input.kind === 'milestone' ? 'עדכון אבן דרך באיחור' : 'עדכון פריט תכנון באיחור',
      why: `יעד סיום ${input.targetEndDate} · התקדמות ${input.progressPercent}%`,
    };
  }
  return {
    what: input.kind === 'milestone' ? 'Update overdue milestone' : 'Update overdue plan item',
    why: `Target end ${input.targetEndDate} · progress ${input.progressPercent}%`,
  };
}

export function expiringComplianceCopy(
  locale: string,
  input: { status: string; expiresOn: string | null },
): { what: string; why: string } {
  const expired = input.status === 'expired';
  const status = complianceStatusLabel(locale, input.status);
  if (he(locale)) {
    return {
      what: expired ? 'חידוש ציות שפג תוקף' : 'בדיקת ציות שעומד לפוג',
      why: input.expiresOn ? `תוקף עד ${input.expiresOn} · ${status}` : status,
    };
  }
  return {
    what: expired ? 'Renew expired compliance' : 'Review expiring compliance',
    why: input.expiresOn ? `Expires ${input.expiresOn} · ${status}` : status,
  };
}

export function overdueMaintenanceCopy(
  locale: string,
  input: { performedOn: string | null; status: string },
): { what: string; why: string } {
  const status = input.status;
  if (he(locale)) {
    return {
      what: 'השלמת תחזוקה באיחור',
      why: `מתוזמן ${input.performedOn ?? 'בלי תאריך'} · סטטוס ${status}`,
    };
  }
  return {
    what: 'Complete overdue maintenance',
    why: `Scheduled ${input.performedOn ?? 'without date'} · status ${status}`,
  };
}

export function staleProjectCopy(locale: string, days: number): { what: string; why: string } {
  if (he(locale)) {
    return {
      what: 'בדיקת עבודה לא פעילה',
      why: `אין עדכונים כבר ${days}+ ימים`,
    };
  }
  return {
    what: 'Check inactive work',
    why: `No updates for ${days}+ days`,
  };
}

export function creditVoidIssueCopy(locale: string, collectionStatus: string): { what: string; why: string } {
  const status = collectionStatusLabel(locale, collectionStatus);
  if (he(locale)) {
    return {
      what: 'טיפול בזיכוי פתוח',
      why: `סטטוס גבייה של הזיכוי: ${status}`,
    };
  }
  return {
    what: 'Resolve open credit note',
    why: `Credit note collection is ${status}`,
  };
}

export function monthCloseIncompleteCopy(
  locale: string,
  input: { yearMonth: string; status: string; completenessPercent: string },
): { what: string; why: string } {
  const status = monthCloseStatusLabel(locale, input.status);
  if (he(locale)) {
    return {
      what: `השלמת סגירת חודש ${input.yearMonth}`,
      why: `סטטוס ${status} · שלמות ${input.completenessPercent}%`,
    };
  }
  return {
    what: `Complete month close ${input.yearMonth}`,
    why: `Status ${status} · completeness ${input.completenessPercent}%`,
  };
}

export function boqMeasurementAwaitingCopy(
  locale: string,
  input: { periodLabel: string; certificateNumber: number },
): { what: string; why: string } {
  if (he(locale)) {
    return {
      what: 'אישור מדידת כתב כמויות',
      why: `חשבון ${input.certificateNumber} · ${input.periodLabel} ממתין לאישור`,
    };
  }
  return {
    what: 'Approve BOQ measurement',
    why: `Certificate ${input.certificateNumber} · ${input.periodLabel} awaits approval`,
  };
}

export function boqProgressReadyToBillCopy(
  locale: string,
  input: { periodLabel: string; certificateNumber: number },
): { what: string; why: string } {
  if (he(locale)) {
    return {
      what: 'יצירת חשבון חלקי מכתב כמויות',
      why: `חשבון ${input.certificateNumber} · ${input.periodLabel} מאושר ומוכן לחיוב`,
    };
  }
  return {
    what: 'Create BOQ progress bill',
    why: `Certificate ${input.certificateNumber} · ${input.periodLabel} approved and ready to bill`,
  };
}

export function boqVsContractMismatchCopy(
  locale: string,
  input: { status: string },
): { what: string; why: string } {
  if (he(locale)) {
    return {
      what: 'התאמת כתב כמויות לחוזה',
      why: `פער בין חוזה לכתב כמויות · ${input.status}`,
    };
  }
  return {
    what: 'Reconcile BOQ vs contract',
    why: `Contract and BOQ diverge · ${input.status}`,
  };
}

function allocationStatusLabel(locale: string, status: string): string {
  if (!he(locale)) return status;
  if (status === 'applied') return 'הוחל';
  if (status === 'draft') return 'טיוטה';
  return status;
}

function entityTypeLabel(locale: string, entityType: string): string {
  if (!he(locale)) return entityType;
  const map: Record<string, string> = {
    expense: 'הוצאה',
    vendor_bill: 'חשבון ספק',
    vendor_credit: 'זיכוי ספק',
    billing_record: 'חיוב',
    payment: 'תשלום',
  };
  return map[entityType] ?? entityType;
}

function complianceStatusLabel(locale: string, status: string): string {
  if (!he(locale)) return status;
  if (status === 'expired') return 'פג תוקף';
  if (status === 'expiring_soon') return 'עומד לפוג';
  return status;
}

function collectionStatusLabel(locale: string, status: string): string {
  if (!he(locale)) return status;
  if (status === 'open') return 'פתוח';
  if (status === 'partial') return 'חלקי';
  if (status === 'overdue') return 'באיחור';
  if (status === 'paid') return 'שולם';
  return status;
}

function monthCloseStatusLabel(locale: string, status: string): string {
  if (!he(locale)) return status;
  if (status === 'open') return 'פתוח';
  if (status === 'ready') return 'מוכן לסגירה';
  if (status === 'closed') return 'סגור';
  return status;
}
