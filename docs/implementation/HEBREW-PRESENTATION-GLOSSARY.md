# Hebrew presentation glossary

Presentation-only labels for authenticated product UI (`he-IL`). Do **not** change DB enums, schema keys, permission keys, or calculation code to match these strings.

| English (canonical concept) | Hebrew (customer UI) | Notes |
| --- | --- | --- |
| Actual Cost | עלות בפועל | Keep separate from commitments and forecasts. |
| Committed Cost | התחייבויות | **Not** מחויב / מתחייב — confusable with billing. |
| Forecast | תחזית | Never imply “actual”. |
| Billing / Billed | חיובים / חויב | Commercial billing records, not tax invoices. |
| Paid | שולם | |
| Outstanding | יתרה לגבייה / יתרה פתוחה | Prefer **יתרה לגבייה** for AR; **יתרה פתוחה** when context is open balance. |
| VAT | מע״מ | Never treat as profit or revenue. |
| Contract Amount | סכום חוזה | **Not** שווי חוזה for the same concept. |
| Vendor Bill | חשבון ספק | |
| AP (primary labels) | חשבונות ספקים / התאמת חשבון ספק | Never “AP” or “התאמת AP” in he-IL customer UI. English customer screens prefer “Vendor bills”; technical “AP” sparingly in developer contexts only. |
| Prospect | מתעניין | Not פרוספקט. |
| Lead | ליד | |
| Won | נסגר בהצלחה | Not נצח. |
| Lost | לא נסגר | Not אבוד. |
| PO | הזמנת רכש | |
| RFQ | בקשת הצעת מחיר | |

## CRM section order

Nav order (component + locale keys): **prospects → leads → opportunities**.

## Scope

Applies to authenticated product locales and related UI labels. Marketing homepage copy (`marketing.json`, `docs/marketing`, public homepage) is out of scope for this glossary pass.
