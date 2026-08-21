import {
  getClientById,
  getClientFinancials,
  listClientsForOrg,
  listContactsForClient,
} from "@/modules/clients";

import { listOrgContracts, listProjectsForOrg } from "@/modules/projects";

import {
  getVendorById,
  listVendorSubcontracts,
  listVendorsForOrg,
} from "@/modules/vendors";

import {
  getOrganizationApPayables,
  getOrganizationPayablesAging,
  getVendorApOutstanding,
  listApBillsForOrg,
} from "@/modules/ap";

import {
  getOrganizationReceivablesAging,
  getOrganizationReceivablesSummary,
  listBillingRecords,
} from "@/modules/billing";

import {
  listTimesheetsForOrg,
  listTimeEntriesForOrg,
  canReadWorkforceCost,
} from "@/modules/workforce";

import {
  listInventoryItemsForOrg,
  listRecentInventoryMovementsForOrg,
} from "@/modules/assets";

import { listComplianceArtifactsForOrg } from "@/modules/compliance/application/list-artifacts";

import { listOpportunitiesForOrg } from "@/modules/crm/application/opportunities";

import { listLeadsForOrg } from "@/modules/crm/application/leads";

import {
  groupOpportunitiesByStage,
  nextActionUrgency,
} from "@/modules/crm/domain/pipeline-board";

import { OPPORTUNITY_STAGES } from "@/modules/crm/domain/types";

import { gatherCompletenessSignals } from "@/modules/month-close";

import { scoreCompleteness } from "@/modules/month-close/domain/completeness";

import { currentYearMonth } from "@/modules/month-close/domain/year-month";

import { listMonthCloseWorkspace } from "@/modules/month-close/application/manage-periods";

import {
  getSafetySummaryForOrg,
  listOpenSafetyActionsForOrg,
} from "@/modules/safety";

import { isCorrectiveActionOverdue } from "@/modules/safety/domain/overdue";

import {
  buildContractSummaryReport,
  buildCustomerStatementReport,
  buildProcurementRfqReport,
  buildPurchaseOrderReport,
  buildTimesheetReport,
  buildWorkOrderReport,
} from "./generate-branded-entity-reports";

import type { OrgContext } from "@/shared/auth/context";

import { todayInTimeZone } from "@/shared/dates";

import { NotFoundError } from "@/shared/errors";

import { addMoney, isPositiveMoney, money, zeroMoney } from "@/shared/money";

import { formatMoney } from "@/shared/money/format";

import { hasPermission } from "@/shared/permissions/assert";

import { PERMISSIONS } from "@/shared/permissions/catalog";

import {
  getReportsCopy,
  reportDirection,
  reportTitle,
  resolveReportLocale,
} from "../domain/copy";

import type {
  ReportKind,
  ReportPayload,
  ReportRow,
  ReportSection,
} from "../domain/types";

type BuildCtx = {
  locale: string;

  copy: ReturnType<typeof getReportsCopy>;

  generatedAt: Date;

  companyName: string;
};

function envelope(input: {
  kind: ReportKind;

  locale: string;

  generatedAt: Date;

  identity: ReportPayload["identity"];

  sections: readonly ReportSection[];

  notices: readonly string[];

  omitted?: ReportPayload["omitted"];
}): ReportPayload {
  return {
    kind: input.kind,

    title: reportTitle(getReportsCopy(input.locale), input.kind),

    generatedAt: input.generatedAt.toISOString(),

    locale: resolveReportLocale(input.locale),

    dir: reportDirection(input.locale),

    identity: input.identity,

    notices: input.notices,

    sections: input.sections,

    omitted: input.omitted ?? {},
  };
}

function orgIdentity(
  companyName: string,
  extra?: string | null,
): ReportPayload["identity"] {
  return {
    companyName,

    projectId: null,

    projectName: null,

    projectNumber: null,

    clientName: null,

    extra: extra ?? null,
  };
}

function deepLinkExtra(path: string, label?: string): readonly string[] {
  return [label ? `${label}: ${path}` : `Open: ${path}`];
}

export async function buildExtendedReport(
  context: OrgContext,

  kind: ReportKind,

  id: string,

  ctx: BuildCtx,
): Promise<ReportPayload | null> {
  switch (kind) {
    case "client_360":
      return buildClient360(context, id, ctx);

    case "vendor_360":
      return buildVendor360(context, id, ctx);

    case "contract_portfolio":
      return buildContractPortfolio(context, id, ctx);

    case "subcontract_cash":
      return buildSubcontractCash(context, id, ctx);

    case "labor_utilization":
      return buildLaborUtilization(context, id, ctx);

    case "retention_schedule":
      return buildRetentionSchedule(context, id, ctx);

    case "inventory_movement":
      return buildInventoryMovement(context, id, ctx);

    case "compliance_expiry":
      return buildComplianceExpiry(context, id, ctx);

    case "crm_funnel":
      return buildCrmFunnel(context, id, ctx);

    case "month_close_completeness":
      return buildMonthClose(context, id, ctx);

    case "safety_open_actions":
      return buildSafetyOpen(context, id, ctx);

    case "purchase_order":
      return buildPurchaseOrderReport(context, id, ctx);

    case "procurement_rfq":
      return buildProcurementRfqReport(context, id, ctx);

    case "customer_statement":
      return buildCustomerStatementReport(context, id, ctx);

    case "contract_summary":
      return buildContractSummaryReport(context, id, ctx);

    case "work_order":
      return buildWorkOrderReport(context, id, ctx);

    case "service_completion":
      return buildWorkOrderReport(context, id, ctx, "service_completion");

    case "timesheet":
      return buildTimesheetReport(context, id, ctx);

    default:
      return null;
  }
}

async function buildClient360(
  context: OrgContext,

  clientId: string,

  ctx: BuildCtx,
): Promise<ReportPayload> {
  const client = await getClientById(context, clientId);

  if (!client) throw new NotFoundError("Client");

  const sections: ReportSection[] = [
    {
      id: "identity",

      heading: ctx.copy.sections.identity,

      rows: [
        {
          label: ctx.copy.identity.client,
          value: client.name,
          href: `/clients/${client.id}`,
        },

        { label: "Status", value: client.status ?? "-" },

        { label: "Type", value: client.clientTypeName ?? "-" },
      ],
    },
  ];

  const [contacts, projects] = await Promise.all([
    listContactsForClient(context, clientId).catch(() => []),

    listProjectsForOrg(context, { clientId, limit: 25 }).catch(() => []),
  ]);

  sections.push({
    id: "contacts",

    heading: "Contacts",

    rows: contacts.slice(0, 8).map((contact) => ({
      label: contact.name,

      value:
        [contact.role, contact.email, contact.phone]
          .filter(Boolean)
          .join(" · ") || "-",
    })),

    paragraphs:
      contacts.length === 0
        ? ["No contacts on file for this client."]
        : undefined,
  });

  sections.push({
    id: "projects",

    heading: "Projects",

    rows: projects.map((project) => ({
      label: project.name,

      value: project.status ?? "-",

      href: `/projects/${project.id}`,
    })),

    paragraphs:
      projects.length === 0
        ? ["No accessible projects linked to this client."]
        : deepLinkExtra("/projects", "All projects"),
  });

  const omitted: ReportPayload["omitted"] = hasPermission(
    context,
    PERMISSIONS.BILLING_READ,
  )
    ? {}
    : { commercial: true };

  if (hasPermission(context, PERMISSIONS.BILLING_READ)) {
    const financials = await getClientFinancials(context, clientId).catch(
      () => null,
    );

    if (financials) {
      sections.push({
        id: "billing_kpi",

        heading: ctx.copy.sections.billing,

        rows: [
          {
            label: "Outstanding",

            value: formatMoney(financials.snapshot.outstanding, ctx.locale),

            nature: "cash",
          },

          {
            label: "Invoiced",

            value: formatMoney(financials.snapshot.invoiced, ctx.locale),

            nature: "cash",
          },

          {
            label: "Overdue",

            value: formatMoney(financials.snapshot.overdue, ctx.locale),

            nature: "cash",
          },

          ...(financials.snapshot.heldRetention
            ? [
                {
                  label: "Retention held",

                  value: formatMoney(
                    financials.snapshot.heldRetention,
                    ctx.locale,
                  ),

                  nature: "cash" as const,
                },
              ]
            : []),
        ],
      });

      sections.push({
        id: "billing_recent",

        heading: "Recent billing",

        rows: financials.recentBilling.slice(0, 8).map((record) => ({
          label: record.reference ?? record.id.slice(0, 8),

          value: `${formatMoney(record.outstandingAmount, ctx.locale)} · ${record.status}`,

          nature: "cash" as const,

          href: `/billing/${record.id}`,
        })),

        paragraphs:
          financials.recentBilling.length === 0
            ? ["No billing records for this client."]
            : deepLinkExtra("/billing"),
      });
    }
  }

  return envelope({
    kind: "client_360",

    locale: ctx.locale,

    generatedAt: ctx.generatedAt,

    identity: { ...orgIdentity(ctx.companyName), clientName: client.name },

    sections,

    notices: [ctx.copy.snapshotNote],

    omitted,
  });
}

async function buildVendor360(
  context: OrgContext,

  vendorId: string,

  ctx: BuildCtx,
): Promise<ReportPayload> {
  const vendor = await getVendorById(context, vendorId);

  if (!vendor) throw new NotFoundError("Vendor");

  const sections: ReportSection[] = [
    {
      id: "identity",

      heading: ctx.copy.sections.identity,

      rows: [
        { label: "Vendor", value: vendor.name, href: `/vendors/${vendor.id}` },

        { label: "Type", value: vendor.type },

        { label: "Status", value: vendor.status ?? "-" },
      ],
    },
  ];

  const subs = hasPermission(context, PERMISSIONS.VENDORS_READ)
    ? await listVendorSubcontracts(context, vendorId).catch(() => [])
    : [];

  if (subs.length > 0) {
    const totalOutstanding = subs.reduce(
      (sum, sub) => sum + Number(sub.outstandingAmount ?? 0),

      0,
    );

    sections.push({
      id: "subcontracts",

      heading: "Subcontracts",

      rows: [
        { label: "Active subcontracts", value: String(subs.length) },

        {
          label: "Cash outstanding (sum)",

          value: totalOutstanding.toFixed(2),

          nature: "cash",
        },

        ...subs.slice(0, 12).map((sub) => ({
          label: `${sub.projectName} · ${sub.subcontractNumber ?? sub.title}`,

          value: `${sub.outstandingAmount} ${sub.currency}`,

          nature: "cash" as const,

          href: `/projects/${sub.projectId}`,
        })),
      ],
    });
  } else if (hasPermission(context, PERMISSIONS.VENDORS_READ)) {
    sections.push({
      id: "subcontracts",

      heading: "Subcontracts",

      paragraphs: [
        "No subcontract agreements for this vendor on accessible projects.",
      ],
    });
  }

  const omitted: ReportPayload["omitted"] = hasPermission(
    context,
    PERMISSIONS.AP_READ,
  )
    ? {}
    : { commercial: true };

  if (hasPermission(context, PERMISSIONS.AP_READ)) {
    const [apSummary, bills] = await Promise.all([
      getVendorApOutstanding(context, vendorId).catch(() => null),

      listApBillsForOrg(context, { limit: 80 }),
    ]);

    const vendorBills = bills.filter((bill) => bill.vendorId === vendorId);

    if (apSummary) {
      sections.push({
        id: "ap_kpi",

        heading: "Accounts payable",

        rows: [
          {
            label: "Outstanding",

            value: formatMoney(
              money(apSummary.outstanding, apSummary.currency),
              ctx.locale,
            ),

            nature: "cash",
          },

          {
            label: "Retention held",

            value: formatMoney(
              money(apSummary.retentionHeld, apSummary.currency),
              ctx.locale,
            ),

            nature: "cash",
          },

          {
            label: "Open bills",
            value: String(apSummary.unpaidCount + apSummary.partialCount),
          },
        ],

        paragraphs: deepLinkExtra("/procurement/ap/aging", "AP aging"),
      });
    }

    sections.push({
      id: "ap_bills",

      heading: "Recent bills",

      rows: vendorBills.slice(0, 15).map((bill) => ({
        label: bill.reference ?? bill.id.slice(0, 8),

        value: `${bill.totalAmount} ${bill.currency} · ${bill.status}`,

        nature: "cash" as const,

        href: `/procurement/ap/${bill.id}`,
      })),

      paragraphs:
        vendorBills.length === 0
          ? ["No AP bills for this vendor in the recent list."]
          : undefined,
    });
  }

  return envelope({
    kind: "vendor_360",

    locale: ctx.locale,

    generatedAt: ctx.generatedAt,

    identity: orgIdentity(ctx.companyName, vendor.name),

    sections,

    notices: [ctx.copy.snapshotNote],

    omitted,
  });
}

async function buildContractPortfolio(
  context: OrgContext,

  _id: string,

  ctx: BuildCtx,
): Promise<ReportPayload> {
  const contracts = hasPermission(context, PERMISSIONS.CONTRACTS_READ)
    ? await listOrgContracts(context, { limit: 60 })
    : [];

  const byStatus = new Map<string, number>();

  let activeValue = zeroMoney(context.organization.baseCurrency);

  for (const contract of contracts) {
    byStatus.set(contract.status, (byStatus.get(contract.status) ?? 0) + 1);

    if (contract.status === "active" && contract.currentAmount) {
      const amount = money(contract.currentAmount, contract.currency);

      if (amount.currency === activeValue.currency) {
        activeValue = addMoney(activeValue, amount);
      }
    }
  }

  const kpiRows: ReportRow[] = [
    { label: "Contracts listed", value: String(contracts.length) },

    ...[...byStatus.entries()].map(([status, count]) => ({
      label: `Status · ${status}`,

      value: String(count),
    })),

    {
      label: "Active contract value (base currency)",

      value: formatMoney(activeValue, ctx.locale),

      nature: "commercial" as const,
    },
  ];

  const detailRows: ReportRow[] = contracts.slice(0, 40).map((contract) => ({
    label: `${contract.projectName} · ${contract.contractNumber ?? contract.name ?? contract.id.slice(0, 8)}`,

    value: `${contract.status} · ${contract.currentAmount ?? "-"} ${contract.currency}`,

    nature: "commercial" as const,

    href: `/projects/${contract.projectId}`,
  }));

  return envelope({
    kind: "contract_portfolio",

    locale: ctx.locale,

    generatedAt: ctx.generatedAt,

    identity: orgIdentity(ctx.companyName),

    sections: [
      {
        id: "kpi",

        heading: "Portfolio KPIs",

        rows: kpiRows,
      },

      {
        id: "contracts",

        heading: "Contract portfolio",

        rows: detailRows,

        paragraphs:
          contracts.length === 0
            ? ["No contracts found on accessible projects."]
            : deepLinkExtra("/contracts", "Contracts directory"),
      },
    ],

    notices: [ctx.copy.snapshotNote],
  });
}

async function buildSubcontractCash(
  context: OrgContext,

  vendorId: string,

  ctx: BuildCtx,
): Promise<ReportPayload> {
  const vendor = await getVendorById(context, vendorId);

  if (!vendor) throw new NotFoundError("Vendor");

  const subs = await listVendorSubcontracts(context, vendorId);

  const currency = context.organization.baseCurrency;

  let totalOutstanding = zeroMoney(currency);

  let totalCurrent = zeroMoney(currency);

  for (const sub of subs) {
    const outstanding = money(sub.outstandingAmount, sub.currency);

    const current = money(
      sub.currentAmount ?? sub.originalAmount ?? "0",
      sub.currency,
    );

    if (outstanding.currency === currency)
      totalOutstanding = addMoney(totalOutstanding, outstanding);

    if (current.currency === currency)
      totalCurrent = addMoney(totalCurrent, current);
  }

  const rows: ReportRow[] = subs.slice(0, 30).map((sub) => ({
    label: `${sub.projectName} · ${sub.subcontractNumber ?? sub.title}`,

    value: `${sub.outstandingAmount} ${sub.currency} outstanding · ${sub.status}`,

    nature: "cash" as const,

    href: `/projects/${sub.projectId}`,
  }));

  return envelope({
    kind: "subcontract_cash",

    locale: ctx.locale,

    generatedAt: ctx.generatedAt,

    identity: orgIdentity(ctx.companyName, vendor.name),

    sections: [
      {
        id: "kpi",

        heading: "Subcontract cash KPIs",

        rows: [
          { label: "Agreements", value: String(subs.length) },

          {
            label: "Total outstanding (base)",

            value: formatMoney(totalOutstanding, ctx.locale),

            nature: "cash",
          },

          {
            label: "Current value (base)",

            value: formatMoney(totalCurrent, ctx.locale),

            nature: "committed",
          },
        ],
      },

      {
        id: "subs",

        heading: "Subcontract cash view",

        rows,

        paragraphs:
          subs.length === 0
            ? ["No subcontract agreements for this vendor."]
            : [
                "Cash / retention timing — not Actual cost.",

                ...deepLinkExtra(`/vendors/${vendor.id}`, "Vendor detail"),
              ],
      },
    ],

    notices: [ctx.copy.snapshotNote],
  });
}

async function buildLaborUtilization(
  context: OrgContext,

  _id: string,

  ctx: BuildCtx,
): Promise<ReportPayload> {
  const [sheets, entries] = await Promise.all([
    listTimesheetsForOrg(context, { status: "all" }),

    listTimeEntriesForOrg(context, {
      status: "recorded",
      approvalStatus: "all",
    }),
  ]);

  const projectHours = entries

    .filter((entry) => entry.kind === "project")

    .reduce((sum, entry) => sum + Number(entry.hours), 0);

  const nonProjectHours = entries

    .filter((entry) => entry.kind !== "project")

    .reduce((sum, entry) => sum + Number(entry.hours), 0);

  const totalHours = projectHours + nonProjectHours;

  const utilizationPct =
    totalHours > 0 ? ((projectHours / totalHours) * 100).toFixed(1) : "0.0";

  const hoursByProject = new Map<string, number>();

  for (const entry of entries.filter(
    (e) => e.kind === "project" && e.projectId,
  )) {
    hoursByProject.set(
      entry.projectId!,

      (hoursByProject.get(entry.projectId!) ?? 0) + Number(entry.hours),
    );
  }

  const topProjects = [...hoursByProject.entries()]

    .sort((a, b) => b[1] - a[1])

    .slice(0, 12);

  const sections: ReportSection[] = [
    {
      id: "hours",

      heading: "Utilization (hours)",

      rows: [
        { label: "Project hours", value: projectHours.toFixed(2) },

        { label: "Non-project hours", value: nonProjectHours.toFixed(2) },

        { label: "Project share", value: `${utilizationPct}%` },

        { label: "Timesheet periods", value: String(sheets.length) },

        { label: "Recorded entries", value: String(entries.length) },
      ],

      paragraphs: deepLinkExtra("/workforce/timesheets", "Timesheets"),
    },

    {
      id: "by_project",

      heading: "Hours by project",

      rows: topProjects.map(([projectId, hours]) => ({
        label: projectId.slice(0, 8),

        value: hours.toFixed(2),

        href: `/projects/${projectId}`,
      })),

      paragraphs:
        topProjects.length === 0
          ? ["No project hours recorded in the current list."]
          : undefined,
    },
  ];

  const omitted: ReportPayload["omitted"] = canReadWorkforceCost(context)
    ? {}
    : { compensation: true };

  if (canReadWorkforceCost(context)) {
    const withCost = entries.filter(
      (entry) => entry.costAmount && entry.costCurrency,
    );

    const costTotal = withCost.reduce(
      (sum, entry) => sum + Number(entry.costAmount ?? 0),
      0,
    );

    sections.push({
      id: "cost",

      heading: "Labor cost (gated)",

      rows: [
        {
          label: "Entries with cost snapshot",
          value: String(withCost.length),
          nature: "actual",
        },

        {
          label: "Sum of snapshotted cost",
          value: costTotal.toFixed(2),
          nature: "actual",
        },
      ],
    });
  }

  return envelope({
    kind: "labor_utilization",

    locale: ctx.locale,

    generatedAt: ctx.generatedAt,

    identity: orgIdentity(ctx.companyName),

    sections,

    notices: [ctx.copy.snapshotNote, "Not payroll."],

    omitted,
  });
}

async function buildRetentionSchedule(
  context: OrgContext,

  _id: string,

  ctx: BuildCtx,
): Promise<ReportPayload> {
  const sections: ReportSection[] = [];

  const currency = context.organization.baseCurrency;

  if (hasPermission(context, PERMISSIONS.BILLING_READ)) {
    const [arSummary, arAging, billingRecords] = await Promise.all([
      getOrganizationReceivablesSummary(context).catch(() => null),

      getOrganizationReceivablesAging(context).catch(() => null),

      listBillingRecords(context, { filter: "all", limit: 3_000 }).catch(
        () => [],
      ),
    ]);

    let arRetentionHeld = zeroMoney(currency);

    for (const record of billingRecords) {
      if (record.status !== "finalized") continue;

      if (record.totalAmount.currency !== currency) continue;

      const held = record.retentionHeldRemaining;

      if (held && isPositiveMoney(held)) {
        arRetentionHeld = addMoney(arRetentionHeld, held);
      }
    }

    const arKpi: ReportRow[] = [];

    if (arSummary) {
      arKpi.push(
        {
          label: "AR outstanding",

          value: formatMoney(arSummary.totalOutstanding, ctx.locale),

          nature: "cash",
        },

        {
          label: "Overdue AR",
          value: formatMoney(arSummary.overdueTotal, ctx.locale),
          nature: "cash",
        },
      );
    }

    if (isPositiveMoney(arRetentionHeld)) {
      arKpi.push({
        label: "Retention held (AR)",

        value: formatMoney(arRetentionHeld, ctx.locale),

        nature: "cash",
      });
    }

    if (
      arSummary &&
      arSummary.retentionReleaseOpenCount > 0 &&
      arSummary.retentionReleaseOutstanding
    ) {
      arKpi.push({
        label: "Retention release outstanding",

        value: formatMoney(arSummary.retentionReleaseOutstanding, ctx.locale),

        nature: "cash",
      });
    }

    if (arKpi.length > 0) {
      sections.push({
        id: "ar_kpi",

        heading: "Receivables retention",

        rows: arKpi,
      });
    }

    if (arAging) {
      sections.push({
        id: "ar",

        heading: "AR aging (cash)",

        rows: arAging.buckets.map((bucket) => ({
          label: bucket.key,

          value: formatMoney(bucket.total, ctx.locale),

          nature: "cash" as const,
        })),

        paragraphs: deepLinkExtra("/billing"),
      });
    }
  }

  if (hasPermission(context, PERMISSIONS.AP_READ)) {
    const [apSummary, apAging] = await Promise.all([
      getOrganizationApPayables(context).catch(() => null),

      getOrganizationPayablesAging(context).catch(() => null),
    ]);

    if (apSummary) {
      sections.push({
        id: "ap_kpi",

        heading: "Payables retention",

        rows: [
          {
            label: "AP outstanding",

            value: formatMoney(
              money(apSummary.outstanding, apSummary.currency),
              ctx.locale,
            ),

            nature: "cash",
          },

          {
            label: "Retention held (AP)",

            value: formatMoney(
              money(apSummary.retentionHeld, apSummary.currency),
              ctx.locale,
            ),

            nature: "cash",
          },
        ],

        paragraphs: deepLinkExtra("/procurement/ap/aging", "AP aging"),
      });
    }

    if (apAging) {
      sections.push({
        id: "ap",

        heading: "AP aging (cash)",

        rows: apAging.buckets.map((bucket) => ({
          label: bucket.key,

          value: formatMoney(bucket.total, ctx.locale),

          nature: "cash" as const,
        })),
      });
    }
  }

  if (sections.length === 0) {
    sections.push({
      id: "empty",

      heading: "Retention schedule",

      paragraphs: [
        "No billing.read or ap.read access for retention cash sections.",
      ],
    });
  }

  return envelope({
    kind: "retention_schedule",

    locale: ctx.locale,

    generatedAt: ctx.generatedAt,

    identity: orgIdentity(ctx.companyName),

    sections,

    notices: [ctx.copy.snapshotNote, "Retention is cash timing, not profit."],
  });
}

async function buildInventoryMovement(
  context: OrgContext,

  _id: string,

  ctx: BuildCtx,
): Promise<ReportPayload> {
  const [items, movements] = await Promise.all([
    listInventoryItemsForOrg(context).catch(() => []),

    listRecentInventoryMovementsForOrg(context, { limit: 35 }).catch(() => []),
  ]);

  const lowStock = items.filter(
    (item) =>
      item.reorderLevel &&
      Number(item.quantityOnHand) <= Number(item.reorderLevel),
  );

  const moveRows: ReportRow[] = movements.map((move) => ({
    label: `${move.itemName ?? move.itemSku ?? move.inventoryItemId.slice(0, 8)} · ${move.movementType}`,

    value: `${move.quantity} · ${move.occurredOn}`,

    href: `/assets/inventory/${move.inventoryItemId}`,
  }));

  return envelope({
    kind: "inventory_movement",

    locale: ctx.locale,

    generatedAt: ctx.generatedAt,

    identity: orgIdentity(ctx.companyName),

    sections: [
      {
        id: "kpi",

        heading: "Inventory KPIs",

        rows: [
          { label: "Active items", value: String(items.length) },

          { label: "Recent movements", value: String(movements.length) },

          { label: "At/below reorder", value: String(lowStock.length) },
        ],
      },

      {
        id: "items",

        heading: "Inventory items",

        rows: items.slice(0, 20).map((item) => ({
          label: item.name ?? item.sku ?? item.id.slice(0, 8),

          value: item.quantityOnHand,

          href: `/assets/inventory/${item.id}`,
        })),

        paragraphs:
          items.length === 0
            ? ["No inventory items in this organization."]
            : undefined,
      },

      {
        id: "moves",

        heading: "Recent movements",

        rows: moveRows,

        paragraphs:
          moveRows.length === 0
            ? ["No inventory movements recorded yet."]
            : [
                "Quantities only — not costing.",

                ...deepLinkExtra("/assets/inventory", "Inventory"),
              ],
      },
    ],

    notices: [ctx.copy.snapshotNote],
  });
}

async function buildComplianceExpiry(
  context: OrgContext,

  _id: string,

  ctx: BuildCtx,
): Promise<ReportPayload> {
  if (!hasPermission(context, PERMISSIONS.COMPLIANCE_READ)) {
    return envelope({
      kind: "compliance_expiry",

      locale: ctx.locale,

      generatedAt: ctx.generatedAt,

      identity: orgIdentity(ctx.companyName),

      sections: [
        {
          id: "denied",

          heading: "Compliance expiry",

          paragraphs: ["compliance.read permission required."],
        },
      ],

      notices: [ctx.copy.snapshotNote],
    });
  }

  const [expiring, expired, all] = await Promise.all([
    listComplianceArtifactsForOrg(context, {
      status: "expiring_soon",
      limit: 40,
    }),

    listComplianceArtifactsForOrg(context, { status: "expired", limit: 40 }),

    listComplianceArtifactsForOrg(context, { limit: 200 }),
  ]);

  const statusCounts = new Map<string, number>();

  for (const artifact of all) {
    statusCounts.set(
      artifact.status,
      (statusCounts.get(artifact.status) ?? 0) + 1,
    );
  }

  const watchlist = [...expiring, ...expired].slice(0, 25);

  return envelope({
    kind: "compliance_expiry",

    locale: ctx.locale,

    generatedAt: ctx.generatedAt,

    identity: orgIdentity(ctx.companyName),

    sections: [
      {
        id: "kpi",

        heading: "Compliance KPIs",

        rows: [
          { label: "Artifacts tracked", value: String(all.length) },

          { label: "Expiring soon", value: String(expiring.length) },

          { label: "Expired", value: String(expired.length) },

          ...[...statusCounts.entries()].map(([status, count]) => ({
            label: `Status · ${status}`,

            value: String(count),
          })),
        ],
      },

      {
        id: "watchlist",

        heading: "Expiry watchlist",

        rows: watchlist.map((artifact) => ({
          label: `${artifact.name} (${artifact.artifactKind})`,

          value: `${artifact.status} · expires ${artifact.expiresOn ?? "-"}`,

          href: `/compliance/${artifact.id}`,
        })),

        paragraphs:
          watchlist.length === 0
            ? ["No expiring or expired artifacts in the current list."]
            : deepLinkExtra("/compliance", "Compliance"),
      },
    ],

    notices: [ctx.copy.snapshotNote],
  });
}

async function buildCrmFunnel(
  context: OrgContext,

  _id: string,

  ctx: BuildCtx,
): Promise<ReportPayload> {
  if (!hasPermission(context, PERMISSIONS.CRM_READ)) {
    return envelope({
      kind: "crm_funnel",

      locale: ctx.locale,

      generatedAt: ctx.generatedAt,

      identity: orgIdentity(ctx.companyName),

      sections: [
        {
          id: "denied",

          heading: "CRM funnel",

          paragraphs: ["crm.read permission required."],
        },
      ],

      notices: [ctx.copy.snapshotNote],
    });
  }

  const now = ctx.generatedAt;

  const [opportunities, leads] = await Promise.all([
    listOpportunitiesForOrg(context, {
      status: "open",
      includeArchived: false,
    }),

    listLeadsForOrg(context, { status: "all", includeArchived: false }),
  ]);

  const columns = groupOpportunitiesByStage(opportunities, OPPORTUNITY_STAGES);

  const pipelineValue = opportunities.reduce(
    (sum, opp) => sum + Number(opp.expectedValueAmount ?? 0),

    0,
  );

  const overdueActions = opportunities.filter(
    (opp) => nextActionUrgency(opp.nextActionAt, now) === "overdue",
  ).length;

  const stageRows: ReportRow[] = columns.map((column) => ({
    label: column.stage,

    value: String(column.items.length),

    nature: "estimate" as const,
  }));

  const topOpps: ReportRow[] = opportunities.slice(0, 20).map((opp) => ({
    label: opp.name,

    value:
      `${opp.stage} · ${opp.expectedValueAmount ?? "-"} ${opp.currency ?? ""}`.trim(),

    href: `/crm/opportunities/${opp.id}`,
  }));

  const leadRows: ReportRow[] = leads.slice(0, 12).map((lead) => ({
    label: lead.title,

    value: lead.status,

    href: `/crm/leads/${lead.id}`,
  }));

  return envelope({
    kind: "crm_funnel",

    locale: ctx.locale,

    generatedAt: ctx.generatedAt,

    identity: orgIdentity(ctx.companyName),

    sections: [
      {
        id: "kpi",

        heading: "Pipeline KPIs",

        rows: [
          { label: "Open opportunities", value: String(opportunities.length) },

          {
            label: "Open leads",
            value: String(leads.filter((l) => l.status !== "converted").length),
          },

          {
            label: "Weighted pipeline (raw sum)",

            value: pipelineValue.toFixed(2),

            nature: "estimate",
          },

          { label: "Overdue next actions", value: String(overdueActions) },
        ],
      },

      {
        id: "stages",

        heading: "Funnel by stage",

        rows: stageRows,

        paragraphs: stageRows.every((row) => row.value === "0")
          ? ["No open opportunities in the pipeline."]
          : undefined,
      },

      {
        id: "opportunities",

        heading: "Open opportunities",

        rows: topOpps,

        paragraphs: deepLinkExtra("/crm", "CRM"),
      },

      {
        id: "leads",

        heading: "Recent leads",

        rows: leadRows,

        paragraphs: leadRows.length === 0 ? ["No leads on file."] : undefined,
      },
    ],

    notices: [ctx.copy.snapshotNote, "Application snapshot — not a BI cube."],
  });
}

async function buildMonthClose(
  context: OrgContext,

  _id: string,

  ctx: BuildCtx,
): Promise<ReportPayload> {
  if (!hasPermission(context, PERMISSIONS.MONTH_CLOSE_READ)) {
    return envelope({
      kind: "month_close_completeness",

      locale: ctx.locale,

      generatedAt: ctx.generatedAt,

      identity: orgIdentity(ctx.companyName),

      sections: [
        {
          id: "denied",

          heading: "Month close completeness",

          paragraphs: ["month_close.read permission required."],
        },
      ],

      notices: [ctx.copy.snapshotNote],
    });
  }

  const yearMonth = currentYearMonth(context.organization.timezone);

  const [workspace, liveSnapshot] = await Promise.all([
    listMonthCloseWorkspace(context, { limit: 6 }),

    gatherCompletenessSignals(
      context.db,
      context.organizationId,
      yearMonth,
    ).then((signals) => scoreCompleteness(signals, { yearMonth })),
  ]);

  const currentPeriod = workspace.periods.find(
    (period) => period.yearMonth === yearMonth,
  );

  const checkRows: ReportRow[] = liveSnapshot.items.map((item) => ({
    label: item.key,

    value: item.applicable
      ? item.issueCount === 0
        ? "Pass"
        : `${item.issueCount} issue(s)`
      : "N/A",
  }));

  const periodRows: ReportRow[] = workspace.periods
    .slice(0, 6)
    .map((period) => ({
      label: period.yearMonth,

      value: `${period.status} · ${period.completenessPercent ?? "-"}%`,

      href: `/month-close/${period.id}`,
    }));

  return envelope({
    kind: "month_close_completeness",

    locale: ctx.locale,

    generatedAt: ctx.generatedAt,

    identity: orgIdentity(ctx.companyName, yearMonth),

    sections: [
      {
        id: "kpi",

        heading: "Completeness KPIs",

        rows: [
          { label: "Target month", value: yearMonth },

          {
            label: "Live completeness",

            value: `${liveSnapshot.percent}% (${liveSnapshot.passedCount}/${liveSnapshot.applicableCount} checks)`,
          },

          {
            label: "Stored period status",

            value: currentPeriod?.status ?? "not opened",
          },
        ],
      },

      {
        id: "checks",

        heading: "Completeness checks",

        rows: checkRows,

        paragraphs:
          liveSnapshot.applicableCount === 0
            ? ["No applicable completeness checks for this month."]
            : undefined,
      },

      {
        id: "periods",

        heading: "Recent periods",

        rows: periodRows,

        paragraphs: [
          "Operational month close — not statutory accounting close.",

          ...deepLinkExtra("/month-close", "Month close"),
        ],
      },
    ],

    notices: [ctx.copy.snapshotNote],
  });
}

async function buildSafetyOpen(
  context: OrgContext,

  _id: string,

  ctx: BuildCtx,
): Promise<ReportPayload> {
  if (!hasPermission(context, PERMISSIONS.SAFETY_READ)) {
    return envelope({
      kind: "safety_open_actions",

      locale: ctx.locale,

      generatedAt: ctx.generatedAt,

      identity: orgIdentity(ctx.companyName),

      sections: [
        {
          id: "denied",

          heading: "Open safety actions",

          paragraphs: ["safety.read permission required."],
        },
      ],

      notices: [ctx.copy.snapshotNote],
    });
  }

  const today = todayInTimeZone(context.organization.timezone);

  const [summary, openActions] = await Promise.all([
    getSafetySummaryForOrg(context),

    listOpenSafetyActionsForOrg(context),
  ]);

  const overdueCount = openActions.filter((action) =>
    isCorrectiveActionOverdue(action, today),
  ).length;

  const actionRows: ReportRow[] = openActions.slice(0, 30).map((action) => ({
    label: action.title,

    value: `${action.status}${action.dueDate ? ` · due ${action.dueDate}` : ""}`,

    href: `/safety/${action.safetyRecordId}`,
  }));

  return envelope({
    kind: "safety_open_actions",

    locale: ctx.locale,

    generatedAt: ctx.generatedAt,

    identity: orgIdentity(ctx.companyName),

    sections: [
      {
        id: "kpi",

        heading: "Safety KPIs",

        rows: [
          { label: "Open records", value: String(summary.openRecords) },

          {
            label: "Open corrective actions",
            value: String(openActions.length),
          },

          { label: "Overdue actions", value: String(overdueCount) },

          {
            label: "Critical/high records",
            value: String(
              summary.bySeverity.critical + summary.bySeverity.high,
            ),
          },
        ],
      },

      {
        id: "actions",

        heading: "Open corrective actions",

        rows: actionRows,

        paragraphs:
          actionRows.length === 0
            ? ["No open corrective actions on accessible projects."]
            : deepLinkExtra("/safety", "Safety / HSE"),
      },
    ],

    notices: [ctx.copy.snapshotNote, "Application report — not a BI platform."],
  });
}

export async function listClientPackOptions(context: OrgContext) {
  if (!hasPermission(context, PERMISSIONS.CLIENTS_READ)) return [];

  return (await listClientsForOrg(context, { limit: 80 })).map((client) => ({
    id: client.id,

    label: client.name,
  }));
}

export async function listVendorPackOptions(context: OrgContext) {
  if (!hasPermission(context, PERMISSIONS.VENDORS_READ)) return [];

  return (await listVendorsForOrg(context)).slice(0, 80).map((vendor) => ({
    id: vendor.id,

    label: vendor.name,
  }));
}
