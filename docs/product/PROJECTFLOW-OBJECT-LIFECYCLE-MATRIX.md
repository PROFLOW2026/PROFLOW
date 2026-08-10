# ProjectFlow — Object Lifecycle Matrix

**Date:** 2026-08-11 · Updated after Master Completion Run  
**Legend:** Y = user-usable from UI · P = partial · N = no · — = N/A

Columns: Create · Read · Edit · Delete · Archive · Restore · Finalize · Void · Supersede · History · Retroactive · Bulk · Mobile

---

## Master matrix

| Object | Create | Read | Edit | Delete | Archive | Restore | Finalize | Void | Supersede | History | Retro | Bulk | Mobile |
|--------|--------|------|------|--------|---------|---------|----------|------|-----------|---------|-------|------|--------|
| **Client** | Y | Y | Y | N | Y | Y | — | — | — | P | — | N | Y |
| **Contact** | Y | Y | Y | Y | N | N | — | — | — | P | — | N | Y |
| **Project** | Y | Y | Y | N | Y | Y | — | — | — | P | P | N | Y |
| **Job** | Y | Y | Y | N | Y | Y | — | — | — | P | P | N | Y |
| **Employee** | Y | Y | Y | N | Y | Y | — | — | — | P | — | N | Y |
| **Employee rate** | Y | Y | P | N | — | — | — | — | Y | Y | Y | N | Y |
| **Employee assignment** | Y | Y | Y | Cancel | — | — | — | — | — | Y | Y | N | Y |
| **Time entry** | Y | Y | N | N | N | N | — | Y | Correct | Y | Y | Y | Y |
| **Attendance day/event** | Y | Y | Replace | N | — | — | — | Y | Replace | Y | Y | N | Y |
| **Monthly employee cost** | Y | Y | Y | N | — | — | Y (apply) | N | Y | P | Y | N | P |
| **Vendor** | Y | Y | Y | N | Y | Y | — | — | — | P | — | N | Y |
| **Vendor engagement** | Y | Y | End | Cancel | — | — | — | — | — | Y | Y | N | Y |
| **Purchase Order** | Y | Y | N | N | Close | N | Y (issue) | Cancel | — | P | — | N | P |
| **Vendor Bill** | Y | Y | N | N | — | N | — | Y | — | Y | Y | N | P |
| **Vendor Credit** | Y | Y | N | N | — | — | — | — | Apply | Y | Y | N | P |
| **Vendor Payment** | Y | Y | N | N | — | — | — | Y | — | Y | Y | N | P |
| **Vendor Bill Allocation** | Y | Y | Y | N | — | — | Y (apply) | N | Y | P | Y | N | P |
| **Expense** | Y | Y | Y (draft) | N | P | N | Y | Y | — | Y | Y | N | Y |
| **Billing Record** | Y | Y | P (draft) | N | — | — | Y | Y | — | Y | Y | N | P |
| **Customer Payment** | Y | Y | N | N | — | — | — | Y | — | Y | Y | N | P |
| **Bank Transaction** | Y (import) | Y | N | N | — | — | — | — | — | P | Y | Y (file) | P |
| **Document** | Y | Y | — | Y (soft) | — | — | — | — | — | P | — | N | Y |
| **Planning Item** | Y | Y | Y | P | — | — | — | — | — | P | — | N | Y (list) |
| **Asset** | Y | Y | Y | N | P | N | — | — | — | P | — | N | Y |
| **Maintenance Record** | Y | Y | Y | N | — | — | — | — | — | P | Y | N | Y |

---

## Notes by object (implemented lifecycle)

| Object | Lifecycle |
|--------|-----------|
| Client / Vendor / Employee | Soft **Archive / Restore**; no hard delete with history |
| Contact | **Edit** + primary; soft remove preserves project integrity |
| Project / Job | Archive hide vs completed/cancelled status; **Restore** |
| Employee rate | **Supersede** with effective dates; never rewrite past windows |
| Assignment | Edit dates / cancel mistaken; ≠ Actual; multi-project OK |
| Time entry | Simple day default; advanced range/bulk + preview; **void / correct** |
| Attendance | Clock in/out; manager manual; void/replace; ≠ project time; ≠ Actual alone |
| Monthly cost | Draft → Apply → Supersede (unchanged model) |
| Expense | Draft → Finalize → Void/Reverse/Correct |
| Vendor Bill | Void (payments-first); Credits reduce economic cost + outstanding |
| Engagement | Dated associate; end/cancel; ≠ Actual |
| PO | Issue → Cancel / Close; commitment cleared on cancel |
| Planning | Project tab לוח זמנים; mobile list/progress; jobs optional |

---

## Retroactive / bulk entry support (current)

| Domain | Single date | Date range create | Bulk repeated | Backdated | Future-dated | Correction |
|--------|-------------|-------------------|---------------|-----------|--------------|------------|
| Employee time | Y | Y | Y | Y | Domain-gated | Void / correct |
| Attendance | Y | N | N | Y (manager) | N typical | Void / replace |
| Expenses | Y | N | N | Y | Y | Y (chain) |
| Vendor bills | Y | N | N | Y | Y | Void + credit |
| Vendor payments | Y | N | N | Y | Y | Void + new |
| Assignments | Y (start/end) | Span | N | Y | Y | Edit / cancel |
| Employee compensation | Y (validFrom) | Via versions | N | Y | Y | Supersede |
| Vendor engagement | Y | Span | N | Y | Y | End / cancel |
| Planning | Y | Span on item | N | Y | Y | Update progress/dates |

---

## Financial history protection (summary)

| Pattern | Where used |
|---------|------------|
| Draft-only edit | Expenses, billing records |
| Void + preserve | Expenses, AP bills, time entries, attendance events |
| Supersede versions | Rates, monthly cost apply, bill allocations |
| Credit notes | AR + AP (not negative fake payments) |
| No Actual from | Assignment, Attendance alone, Vendor engagement, PO commitment |
| Unallocated remains visible | Org-level employee/vendor/overhead remainder |

---

## Integrity invariants (master run)

1. Assignment ≠ Actual  
2. Attendance ≠ Actual (alone)  
3. Time may create provisional labor per existing model; monthly true cost may displace — no double count  
4. Vendor engagement ≠ Actual  
5. PO = commitment only until bill recognition  
6. Vendor payment = cash only  
7. Credits reduce recognized economic cost + outstanding appropriately  
