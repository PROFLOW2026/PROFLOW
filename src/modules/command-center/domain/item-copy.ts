/** Locale-aware WHAT / WHY / WHERE fallbacks. Entity names stay as stored. */

function he(locale: string): boolean {
  return locale.toLowerCase().startsWith('he');
}

export function fallbackWhere(locale: string, key: 'billing' | 'vendorBills' | 'workforce' | 'approvals' | 'project' | 'assets' | 'monthClose' | 'boq' | 'ocr' | 'fieldOps' | 'safety' | 'recurring' | 'timesheets'): string {
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
      case 'ocr':
        return 'סקירת מסמכים';
      case 'fieldOps':
        return 'פעילות שטח';
      case 'safety':
        return 'בטיחות';
      case 'recurring':
        return 'טיוטות חוזרות';
      case 'timesheets':
        return 'גיליונות שעות';
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
    case 'ocr':
      return 'Document review';
    case 'fieldOps':
      return 'Field operations';
    case 'safety':
      return 'Safety';
    case 'recurring':
      return 'Recurring drafts';
    case 'timesheets':
      return 'Timesheets';
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

export function vendorBillApproachingCopy(
  locale: string,
  input: { reference: string | null; dueDate: string; outstanding: string; currency: string },
): { what: string; why: string } {
  if (he(locale)) {
    return {
      what: input.reference ? `חשבון ספק מתקרב לפירעון ${input.reference}` : 'חשבון ספק מתקרב לפירעון',
      why: `לתשלום עד ${input.dueDate} · יתרה ${input.outstanding} ${input.currency}`,
    };
  }
  return {
    what: input.reference ? `Vendor bill due soon ${input.reference}` : 'Vendor bill due soon',
    why: `Due ${input.dueDate} · outstanding ${input.outstanding} ${input.currency}`,
  };
}

export function ocrNeedsReviewCopy(locale: string, filename: string | null): { what: string; why: string } {
  if (he(locale)) {
    return {
      what: 'סקירת מסמך שנסרק',
      why: filename ? `${filename} ממתין לאישור ידני לפני טיוטה` : 'מסמך ממתין לאישור ידני לפני טיוטה',
    };
  }
  return {
    what: 'Review scanned document',
    why: filename
      ? `${filename} needs explicit confirmation before a draft is created`
      : 'Needs explicit confirmation before a draft is created',
  };
}

export function ocrFailedCopy(locale: string, filename: string | null): { what: string; why: string } {
  if (he(locale)) {
    return {
      what: 'ניסיון חוזר לקריאת מסמך',
      why: filename ? `${filename} נכשל — אפשר לנסות שוב` : 'קריאה נכשלה — אפשר לנסות שוב',
    };
  }
  return {
    what: 'Retry a failed document read',
    why: filename ? `${filename} failed and can be retried` : 'Reading failed and can be retried',
  };
}

export function forecastWarningCopy(
  locale: string,
  kind: string,
): { what: string; why: string } {
  if (he(locale)) {
    switch (kind) {
      case 'projected_cost_over_budget':
        return {
          what: 'בדיקת חריגת תקציב צפויה',
          why: 'תחזית העלות עולה על התקציב הפעיל — זו הערכה, לא חריגה בפועל',
        };
      case 'insufficient_remaining_budget':
        return {
          what: 'בדיקת יתרת תקציב לא מספקת',
          why: 'התחייבויות ועלויות צפויות שנותרו גדולות מיתרת התקציב',
        };
      case 'forecast_margin_negative':
        return {
          what: 'בדיקת מרווח תחזית שלילי',
          why: 'מרווח התחזית מתחת לאפס לפי החוזה ותחזית העלות',
        };
      case 'margin_deterioration':
        return {
          what: 'בדיקת הידרדרות מרווח',
          why: 'מרווח התחזית נמוך ממרווח בפועל ב־3 נקודות אחוז או יותר',
        };
      case 'commitment_pressure':
        return {
          what: 'בדיקת לחץ התחייבויות',
          why: 'התחייבויות פתוחות לוחצות על יתרת התקציב',
        };
      case 'billing_lag':
        return {
          what: 'בדיקת פיגור בחיוב',
          why: 'העלות התקדמה משמעותית יותר מהחיוב מול החוזה',
        };
      case 'collection_risk':
        return {
          what: 'בדיקת סיכון גבייה',
          why: 'חלק גדול מהחיוב עדיין פתוח לגבייה',
        };
      case 'high_consumption_vs_progress':
        return {
          what: 'בדיקת צריכת תקציב מול התקדמות',
          why: 'שיעור צריכת התקציב גבוה מההתקדמות הפיזית',
        };
      case 'missing_data':
        return {
          what: 'השלמת נתונים לתחזית',
          why: 'חסרים נתונים כדי להעריך את מצב הפרויקט בביטחון',
        };
      default:
        return { what: 'בדיקת אזהרת תחזית', why: 'יש סיכון כספי צפוי שדורש בדיקה' };
    }
  }
  switch (kind) {
    case 'projected_cost_over_budget':
      return {
        what: 'Review projected budget overrun',
        why: 'Forecast cost exceeds the active budget — a projection, not an actual overrun',
      };
    case 'insufficient_remaining_budget':
      return {
        what: 'Review remaining budget shortfall',
        why: 'Open commitments plus remaining expected cost exceed remaining budget',
      };
    case 'forecast_margin_negative':
      return {
        what: 'Review negative forecast margin',
        why: 'Forecast margin is below zero on contract versus forecast cost',
      };
    case 'margin_deterioration':
      return {
        what: 'Review margin deterioration',
        why: 'Forecast margin is at least 3 points below actual margin',
      };
    case 'commitment_pressure':
      return {
        what: 'Review commitment pressure',
        why: 'Open commitments are pressing remaining budget',
      };
    case 'billing_lag':
      return {
        what: 'Review billing lag',
        why: 'Cost has advanced well ahead of invoicing against the contract',
      };
    case 'collection_risk':
      return {
        what: 'Review collection risk',
        why: 'A large share of invoiced amounts is still outstanding',
      };
    case 'high_consumption_vs_progress':
      return {
        what: 'Review budget consumption vs progress',
        why: 'Budget consumed is running ahead of physical progress',
      };
    case 'missing_data':
      return {
        what: 'Complete forecast inputs',
        why: 'Not enough data to assess project position with confidence',
      };
    default:
      return { what: 'Review forecast warning', why: 'A projected financial risk needs a look' };
  }
}

export function punchOpenCopy(locale: string, title: string): { what: string; why: string } {
  if (he(locale)) {
    return { what: `סגירת ליקוי פתוח — ${title}`, why: 'פריט תיקון עדיין פתוח' };
  }
  return { what: `Close open punch item — ${title}`, why: 'Punch item is still open' };
}

export function safetyOpenCopy(locale: string, title: string): { what: string; why: string } {
  if (he(locale)) {
    return { what: `טיפול ברשומת בטיחות — ${title}`, why: 'רשומת בטיחות עדיין פתוחה' };
  }
  return { what: `Resolve safety record — ${title}`, why: 'Safety record is still open' };
}

export function inspectionOpenCopy(locale: string, title: string, scheduledOn: string | null): { what: string; why: string } {
  if (he(locale)) {
    return {
      what: `השלמת בדיקה — ${title}`,
      why: scheduledOn ? `מתוכננת ל־${scheduledOn} ועדיין פתוחה` : 'בדיקה עדיין פתוחה',
    };
  }
  return {
    what: `Complete inspection — ${title}`,
    why: scheduledOn ? `Scheduled ${scheduledOn} and still open` : 'Inspection is still open',
  };
}

export function recurringDraftIssueCopy(locale: string, title: string, nextRunDate: string): { what: string; why: string } {
  if (he(locale)) {
    return {
      what: `טיפול בטיוטה חוזרת — ${title}`,
      why: `מועד היצירה ${nextRunDate} עבר והטיוטה עדיין פעילה`,
    };
  }
  return {
    what: `Fix recurring draft — ${title}`,
    why: `Next run ${nextRunDate} is overdue while the draft is still active`,
  };
}

export function timesheetMissingCopy(locale: string, periodEnd: string): { what: string; why: string } {
  if (he(locale)) {
    return {
      what: 'הגשת גיליון שעות שטרם הוגש',
      why: `תקופה שהסתיימה ב־${periodEnd} עדיין בטיוטה`,
    };
  }
  return {
    what: 'Submit an overdue timesheet',
    why: `Period ending ${periodEnd} is still a draft`,
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
