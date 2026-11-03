/** The small status chip on the broadcasting phone. */
export function liveBadgeText(viewerJoined: boolean): string {
  return viewerJoined ? LIVE_SHARE_TEXT.liveBadgeViewer : LIVE_SHARE_TEXT.liveBadgeWaiting;
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

  viewerTitle: 'צפייה בשידור חי',
  viewerConnecting: 'מתחבר לשידור…',
  viewerWaitingHost: 'ממתין למשדר…',
  viewerEnded: 'השידור הסתיים.',
  viewerLeft: 'יצאת מהשידור.',
  viewerLeave: 'יציאה',
} as const;
