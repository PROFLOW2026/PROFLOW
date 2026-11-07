/**
 * The small status chip on the broadcasting phone. `viewerLeft` is true after a viewer had joined and then
 * disconnected, so the broadcaster sees the difference between "nobody yet" and "the viewer dropped".
 */
export function liveBadgeText(viewerJoined: boolean, viewerLeft = false): string {
  if (viewerJoined) return LIVE_SHARE_TEXT.liveBadgeViewer;
  return viewerLeft ? LIVE_SHARE_TEXT.liveBadgeViewerLeft : LIVE_SHARE_TEXT.liveBadgeWaiting;
}

export const LIVE_SHARE_TEXT = {
  share: 'שתף שידור',
  title: 'שידור חי לטלפון נוסף',
  hint: 'סרקו את הקוד בטלפון השני, או פתחו שם את הקישור. הצופה לא צריך חשבון או התחברות, והקישור קצר־תוקף ומיועד לצופה אחד. השידור כולל את המצלמה יחד עם שכבת התשתיות, ללא קול, ושום דבר לא מוקלט או נשמר.',
  starting: 'מתחבר לשידור…',
  waitingViewer: 'ממתין לצופה…',
  viewerJoined: 'הצופה מחובר',
  copyLink: 'העתקת קישור',
  copied: 'הקישור הועתק',
  qrAlt: 'קוד QR לפתיחת השידור בטלפון השני',
  end: 'סיום שידור',
  hide: 'הסתרה (השידור ממשיך)',
  cameraNotReady: 'המצלמה עדיין לא מוכנה. נסו שוב בעוד רגע.',
  connectionLost: 'החיבור לשידור נותק.',
  liveBadge: 'משדר',
  liveBadgeViewer: 'משדר · צופה מחובר',
  liveBadgeWaiting: 'משדר · ממתין לצופה',
  liveBadgeViewerLeft: 'משדר · הצופה התנתק',

  viewerTitle: 'צפייה בשידור חי',
  viewerConnecting: 'מתחבר לשידור…',
  viewerWaitingHost: 'ממתין למשדר…',
  viewerEnded: 'השידור הסתיים.',
  viewerLeft: 'יצאת מהשידור.',
  viewerLeave: 'יציאה',
  viewerConnected: 'מחובר',
  viewerReconnecting: 'מתחבר מחדש…',
  viewerDisconnected: 'מנותק',
  viewerFullscreen: 'תצוגה מלאה',
  viewerExitFullscreen: 'יציאה מתצוגה מלאה',
  viewerResetZoom: 'איפוס הזום',

  /* Broadcaster: remote marking and tripod mode */
  controlSwitch: 'אפשר סימון מהטלפון השני',
  controlSwitchHint: 'הצופה יוכל לסמן את 4 הנקודות ולכוונן את ההתאמה. אפשר לבטל בכל רגע.',
  controlOn: 'שליטה מרחוק פעילה',
  controlOff: 'שליטה מרחוק כבויה',
  controlBusy: 'מעדכן הרשאה…',
  controlFailed: 'לא ניתן לעדכן את ההרשאה. נסו שוב.',
  controlBar: 'שליטה',
  controlBarOn: 'ביטול שליטה מרחוק וחזרה לסימון בטלפון הזה',
  controlBarOff: 'אפשר סימון מהטלפון השני',
  tripodSwitch: 'מצב חצובה',
  tripodHint: 'המסך נשאר דלוק, סרגל הכפתורים מצטמצם, והטלפון השני משמש לסימון ולכוונון. מניחים את הטלפון על החצובה מול הקיר.',
  tripodWakeHeld: 'המסך יישאר דלוק בזמן השידור.',
  tripodWakePending: 'מבקש מהדפדפן להשאיר את המסך דלוק…',
  tripodWakeUnsupported: 'הדפדפן לא תומך בנעילת מסך. בטלו כיבוי מסך אוטומטי בהגדרות הטלפון.',
  tripodWakeDenied: 'הדפדפן סירב להשאיר את המסך דלוק. בטלו כיבוי מסך אוטומטי בהגדרות הטלפון.',
  tripodBadge: 'מצב חצובה',
  controlBadge: 'שליטה מרחוק',
  visualOnly: 'ההתאמה חזותית בלבד ואינה אישור למיקום בטוח לקידוח.',
  switchOn: 'פעיל',
  switchOff: 'כבוי',

  /* Viewer: marking from the second phone */
  viewerModeGroup: 'מצב עבודה',
  viewerModeView: 'תצוגה',
  viewerModeViewLong: 'מצב תצוגה: הזזה וזום בלי לסמן נקודות',
  viewerModeMark: 'סימון',
  viewerModeMarkLong: 'מצב סימון: נוגעים בתמונה כדי לסמן או לגרור נקודה',
  viewerUndoPoint: 'בטל נקודה',
  viewerUndoPointLong: 'ביטול הנקודה האחרונה שסומנה',
  viewerRelease: 'החזרה',
  viewerReleaseLong: 'החזר שליטה למשדר',
  viewerOpacity: 'שקיפות',
  viewerControlOn: 'המשדר אישר סימון מהטלפון הזה.',
  viewerControlEnded: 'המשדר ביטל את השליטה מרחוק. התצוגה בלבד.',
  viewerReleased: 'השליטה הוחזרה למשדר.',
  viewerLockedHint: 'היישור נעול. שחררו את הנעילה כדי לשנות נקודות.',
  viewerNeedPoints: 'צריך לסמן 4 נקודות',
  viewerNeedPerspective: 'פרספקטיבה דורשת לפחות 3 נקודות',
  viewerNeedUnlocked: 'היישור נעול – שחררו את הנעילה',
  viewerNoMark: 'אי אפשר לסמן כרגע',
  viewerNextPoint: (n: number) => `סמנו נקודה ${n}/4`,
  viewerAllPlaced: 'כל הנקודות סומנו. גררו נקודה כדי לתקן אותה.',
  viewerPointOrder: 'סדר הנקודות כמו בתמונת המקור',
  viewerFrozen: 'קפוא',
  viewerLocked: 'נעול',
  viewerTripod: 'מצב חצובה',
  viewerSending: 'שולח…',
  viewerStale: 'המשדר זז או שינה כיוון. סמנו את הנקודות מחדש.',
} as const;

/** The status chip while remote marking or tripod mode is on. */
export function liveBadgeExtras(control: boolean, tripod: boolean): string {
  const parts: string[] = [];
  if (tripod) parts.push(LIVE_SHARE_TEXT.tripodBadge);
  if (control) parts.push(LIVE_SHARE_TEXT.controlBadge);
  return parts.length ? ` · ${parts.join(' · ')}` : '';
}
