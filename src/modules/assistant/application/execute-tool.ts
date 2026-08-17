import { getTodayInbox } from '@/modules/command-center';
import { getProjectFinancials } from '@/modules/financials/application/get-project-financials';
import { listBillingRecords } from '@/modules/billing';
import { listApBillsForOrg, isRecognizedVendorBillStatus } from '@/modules/ap';
import { getOrganizationEarlyWarnings } from '@/modules/forecast';
import { globalSearch } from '@/modules/search';
import { addDays, todayInTimeZone } from '@/shared/dates';
import type { OrgContext } from '@/shared/auth/context';
import { AuthorizationError } from '@/shared/errors';
import { assertAssistantToolAllowed } from '../domain/tools';
import { assistantDeniedBody, assistantToolCopy, assistantToolTitle, warningKindLabel } from '../domain/tool-copy';
import type { AssistantToolKey, AssistantToolResult } from '../domain/types';

function denied(locale: string, tool: AssistantToolKey): AssistantToolResult {
  return {
    tool,
    ok: false,
    claimKind: 'fact',
    title: assistantToolTitle(locale, tool),
    body: assistantDeniedBody(locale),
    citations: [],
    permissionDenied: true,
  };
}

function uniqueProjectIds(
  ...values: Array<string | null | undefined>
): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

export async function executeAssistantTool(
  context: OrgContext,
  tool: AssistantToolKey,
  options: { readonly projectId?: string; readonly question?: string } = {},
): Promise<AssistantToolResult> {
  const locale = context.locale || 'he-IL';
  try {
    assertAssistantToolAllowed(context, tool);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return denied(locale, tool);
    }
    throw error;
  }

  switch (tool) {
    case 'today_attention': {
      const inbox = await getTodayInbox(context);
      const lines = inbox.items.slice(0, 8).map((item) => `${item.what} — ${item.why}`);
      return {
        tool,
        ok: true,
        claimKind: 'fact',
        title: assistantToolTitle(locale, tool),
        body: lines.length > 0 ? lines.join('\n') : assistantToolCopy.todayEmpty(locale),
        citations: inbox.items.slice(0, 8).map((item) => ({
          label: item.what,
          href: item.href,
          claimKind: 'fact' as const,
        })),
        accessProjectIds: uniqueProjectIds(
          ...inbox.items.slice(0, 8).map((item) => item.href?.match(/\/projects\/([0-9a-f-]{36})/i)?.[1]),
        ),
      };
    }
    case 'explain_project_profit': {
      if (!options.projectId) {
        return {
          tool,
          ok: true,
          claimKind: 'inference',
          title: assistantToolTitle(locale, tool),
          body: assistantToolCopy.profitNeedProject(locale),
          citations: [],
        };
      }
      const financials = await getProjectFinancials(context, options.projectId);
      if (!financials.profit) {
        return {
          tool,
          ok: true,
          claimKind: 'fact',
          title: assistantToolTitle(locale, tool),
          body: financials.priceNotSet
            ? assistantToolCopy.profitNotSet(locale)
            : assistantToolCopy.profitHidden(locale),
          citations: [
            {
              label: assistantToolCopy.financialsLabel(locale),
              href: `/projects/${options.projectId}?tab=financials`,
              claimKind: 'fact',
            },
          ],
          accessProjectIds: uniqueProjectIds(options.projectId),
        };
      }
      return {
        tool,
        ok: true,
        claimKind: 'fact',
        title: assistantToolTitle(locale, tool),
        body: assistantToolCopy.profitBody(
          locale,
          financials.profit.estimatedProfit.amount,
          financials.profit.actualProfit.amount,
          financials.profit.estimatedProfit.currency,
        ),
        citations: [
          {
            label: assistantToolCopy.financialsLabel(locale),
            href: `/projects/${options.projectId}?tab=financials`,
            claimKind: 'fact',
          },
        ],
        accessProjectIds: uniqueProjectIds(options.projectId),
      };
    }
    case 'clients_owing_money': {
      const records = await listBillingRecords(context, { filter: 'overdue', limit: 20 });
      return {
        tool,
        ok: true,
        claimKind: 'fact',
        title: assistantToolTitle(locale, tool),
        body:
          records.length === 0
            ? assistantToolCopy.clientsEmpty(locale)
            : records
                .slice(0, 8)
                .map(
                  (row) =>
                    `${row.reference ?? row.id}: ${row.outstandingAmount.amount} ${row.outstandingAmount.currency}`,
                )
                .join('\n'),
        citations: records.slice(0, 8).map((row) => ({
          label: row.reference ?? row.id,
          href: `/billing/${row.id}`,
          claimKind: 'fact' as const,
        })),
        accessProjectIds: uniqueProjectIds(...records.slice(0, 8).map((row) => row.projectId)),
      };
    }
    case 'pay_this_week': {
      const today = todayInTimeZone(context.organization.timezone);
      const weekEnd = addDays(today, 7);
      const bills = await listApBillsForOrg(context, { limit: 50 });
      const due = bills.filter((bill) => {
        if (!bill.dueDate || !isRecognizedVendorBillStatus(bill.status)) return false;
        return bill.dueDate <= weekEnd;
      });
      return {
        tool,
        ok: true,
        claimKind: 'fact',
        title: assistantToolTitle(locale, tool),
        body:
          due.length === 0
            ? assistantToolCopy.payEmpty(locale)
            : due
                .slice(0, 8)
                .map((bill) => `${bill.vendorName ?? bill.reference ?? bill.id} · ${bill.dueDate}`)
                .join('\n'),
        citations: due.slice(0, 8).map((bill) => ({
          label: bill.vendorName ?? bill.id,
          href: `/procurement/ap/${bill.id}`,
          claimKind: 'fact' as const,
        })),
        accessProjectIds: uniqueProjectIds(...due.slice(0, 8).map((bill) => bill.projectId)),
      };
    }
    case 'projects_at_risk':
    case 'forecast_over_budget': {
      const warnings = await getOrganizationEarlyWarnings(context);
      const filtered =
        tool === 'forecast_over_budget'
          ? warnings.filter(
              (item) => item.kind === 'projected_cost_over_budget' || item.kind === 'actual_over_budget',
            )
          : warnings;
      return {
        tool,
        ok: true,
        claimKind: 'inference',
        title: assistantToolTitle(locale, tool),
        body:
          filtered.length === 0
            ? assistantToolCopy.riskEmpty(locale)
            : filtered
                .slice(0, 8)
                .map((item) => warningKindLabel(locale, item.kind))
                .join('\n'),
        citations: filtered.slice(0, 8).map((item) => ({
          label: warningKindLabel(locale, item.kind),
          href: item.href,
          claimKind: 'inference' as const,
        })),
        accessProjectIds: uniqueProjectIds(
          ...filtered.slice(0, 8).map((item) => item.href?.match(/\/projects\/([0-9a-f-]{36})/i)?.[1]),
        ),
      };
    }
    case 'supplier_bills_needing_review': {
      const bills = await listApBillsForOrg(context, { limit: 50 });
      const draft = bills.filter((bill) => bill.status === 'draft');
      return {
        tool,
        ok: true,
        claimKind: 'fact',
        title: assistantToolTitle(locale, tool),
        body:
          draft.length === 0
            ? assistantToolCopy.billsEmpty(locale)
            : assistantToolCopy.billsCount(locale, draft.length),
        citations: draft.slice(0, 8).map((bill) => ({
          label: bill.vendorName ?? bill.id,
          href: `/procurement/ap/${bill.id}`,
          claimKind: 'fact' as const,
        })),
        accessProjectIds: uniqueProjectIds(...draft.slice(0, 8).map((bill) => bill.projectId)),
      };
    }
    case 'explain_number': {
      return {
        tool,
        ok: true,
        claimKind: 'inference',
        title: assistantToolTitle(locale, tool),
        body: assistantToolCopy.explainNumber(locale),
        citations: [{ label: assistantToolCopy.financialsLabel(locale), href: '/today', claimKind: 'inference' }],
      };
    }
    case 'find_document': {
      const query = (options.question ?? '').slice(0, 80) || 'document';
      const result = await globalSearch(context, { query, limitPerKind: 5 });
      const docs = result.hits.filter((hit) => hit.kind === 'document');
      return {
        tool,
        ok: true,
        claimKind: 'fact',
        title: assistantToolTitle(locale, tool),
        body:
          docs.length === 0
            ? assistantToolCopy.documentsEmpty(locale)
            : docs.map((hit) => hit.title).join('\n'),
        citations: docs.map((hit) => ({
          label: hit.title,
          href: hit.href,
          claimKind: 'fact' as const,
        })),
        accessProjectIds: uniqueProjectIds(
          ...docs.map((hit) => hit.href.match(/\/projects\/([0-9a-f-]{36})/i)?.[1]),
        ),
        accessDocumentIds: uniqueProjectIds(...docs.map((hit) => hit.id)),
      };
    }
    case 'prepare_draft_expense': {
      return {
        tool,
        ok: true,
        claimKind: 'inference',
        title: assistantToolTitle(locale, tool),
        body: assistantToolCopy.draftExpense(locale),
        draftOnly: true,
        citations: [
          {
            label: assistantToolCopy.expensesLabel(locale),
            href: '/expenses/new',
            claimKind: 'inference',
          },
        ],
      };
    }
    case 'prepare_payment_reminder_draft': {
      const overdue = await listBillingRecords(context, { filter: 'overdue', limit: 1 });
      const record = overdue[0];
      const params = new URLSearchParams({ entityType: 'payment_reminder' });
      if (record?.id) params.set('entityId', record.id);
      if (record?.projectId) params.set('projectId', record.projectId);
      if (record?.clientId) params.set('clientId', record.clientId);
      if (record?.reference) params.set('subject', record.reference);
      return {
        tool,
        ok: true,
        claimKind: 'inference',
        title: assistantToolTitle(locale, tool),
        body: assistantToolCopy.draftReminder(locale),
        draftOnly: true,
        citations: [
          {
            label: assistantToolCopy.reminderLabel(locale),
            href: `/communications/new?${params.toString()}`,
            claimKind: 'inference',
          },
        ],
        accessProjectIds: uniqueProjectIds(record?.projectId),
      };
    }
    default:
      return denied(locale, tool);
  }
}
