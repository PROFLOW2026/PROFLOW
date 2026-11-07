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
} as const;
