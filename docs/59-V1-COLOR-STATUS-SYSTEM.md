# 59 — V1 Color & Status System

**Status:** Planning  
**Phase:** Planning only  
**Philosophy:** Restrained status color; text always present

---

## 1. Color philosophy

Define **functional roles**, not a final locked brand hex.

- Primary / action  
- Neutral / surface  
- Success · Warning · Danger · Information · Pending · Disabled · Focus  

Financial dashboards must **not** become casino red/green.  
Profit/loss always includes **text and signs**, not color alone.

---

## 2. Brand primary

See direction options in `56`. Candidates in `57`.  

```text
OWNER VISUAL DIRECTION DECISION REQUIRED
```

---

## 3. Status → visual mapping

### Project (U4)

| Status | HE | Tone |
|--------|-----|------|
| Draft | טיוטה | Neutral / muted |
| Active | פעיל | Success/info supporting |
| On Hold | בהשהיה | Warning/pending |
| Completed | הושלם | Success muted |
| Cancelled | בוטל | Danger muted / neutral-danger |
| Archived | בארכיון | Disabled/muted |

### Change (U7)

| Status | HE | Tone |
|--------|-----|------|
| Draft | טיוטה | Neutral |
| Awaiting Approval | ממתין לאישור | Pending / warning |
| Approved | מאושר | Success supporting |
| Rejected | נדחה | Danger |
| Cancelled | בוטל | Muted danger/neutral |

Sent = metadata, not a badge status.

### Financial payment-ish

| State | HE | Tone |
|-------|-----|------|
| Paid | שולם | Success muted |
| Partial | חלקי | Info/warning soft |
| Open | פתוח | Neutral |
| Overdue | באיחור | Danger / warning strong |

---

## 4. Badge rules

- Always **text + optional icon**  
- Soft filled or outlined pills; small radius  
- Do not rely on colored pills alone  
- Don’t rainbow the UI — limited palette intensity  

---

## 5. Alerts hierarchy

| Level | Use |
|-------|-----|
| Info | Neutral tips |
| Attention | Unbilled approved change, soft nudge |
| Warning | Budget risk, approaching overdue |
| Critical | Destructive confirm, severe overdue |

Approved-change-not-billed → Attention, not Critical red dashboard.

---

## 6. Calculation basis colors

“Not configured” items use **neutral/muted**, never error red.

---

## 7. Focus & disabled

- Visible focus ring (`color.focus.ring`) for keyboard  
- Disabled: reduced contrast but still readable where possible; don’t rely on color-only disabled affordance  

---

## 8. Related

`56`, `57`, `60`, `63`
