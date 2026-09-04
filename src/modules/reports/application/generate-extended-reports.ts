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
import {
  buildProjectBillingAccountReport,
  buildProjectBillingPlanStatusReport,
} from "./generate-billing-plan-report";

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
import { localizeCode } from "@/shared/i18n/code-display";

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

function deepLinkExtra(
  copy: ReturnType<typeof getReportsCopy>,
  path: string,
): readonly string[] {
  return [`${copy.phrases.open}: ${path}`];
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

    case "project_billing_account":
      return buildProjectBillingAccountReport(context, id, ctx);

    case "project_billing_plan_status":
      return buildProjectBillingPlanStatusReport(context, id, ctx);

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

        { label: ctx.copy.identity.status, value: localizeCode(ctx.locale, client.status) },

        { label: ctx.copy.fields.kind, value: client.clientTypeName ?? "-" },
      ],
    },
  ];

  const [contacts, projects] = await Promise.all([
    listContactsForClient(context, clientId).catch(() => []),

    listProjectsForOrg(context, { clientId, limit: 25 }).catch(() => []),
  ]);

  sections.push({
    id: "contacts",

    heading: ctx.copy.sections.contacts,

    rows: contacts.slice(0, 8).map((contact) => ({
      label: contact.name,

      value:
        [contact.role, contact.email, contact.phone]
          .filter(Boolean)
          .join(" · ") || "-",
    })),

    paragraphs:
      contacts.length === 0
        ? [ctx.copy.empty.noContacts]
        : undefined,
  });

  sections.push({
    id: "projects",

    heading: ctx.copy.sections.projects,

    rows: projects.map((project) => ({
      label: project.name,

      value: localizeCode(ctx.locale, project.status),

      href: `/projects/${project.id}`,
    })),

    paragraphs:
      projects.length === 0
        ? [ctx.copy.empty.noClientProjects]
        : deepLinkExtra(ctx.copy, "/projects"),
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
            label: ctx.copy.fields.outstanding,

            value: formatMoney(financials.snapshot.outstanding, ctx.locale),

            nature: "cash",
          },

          {
            label: ctx.copy.fields.invoiced,

            value: formatMoney(financials.snapshot.invoiced, ctx.locale),

            nature: "cash",
          },

          {
            label: ctx.copy.fields.overdue,

            value: formatMoney(financials.snapshot.overdue, ctx.locale),

            nature: "cash",
          },

          ...(financials.snapshot.heldRetention
            ? [
                {
                  label: ctx.copy.fields.retentionHeld,

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

        heading: ctx.copy.sections.recentBilling,

        rows: financials.recentBilling.slice(0, 8).map((record) => ({
          label: record.reference ?? record.id.slice(0, 8),

          value: `${formatMoney(record.outstandingAmount, ctx.locale)} · ${localizeCode(ctx.locale, record.status)}`,

          nature: "cash" as const,

          href: `/billing/${record.id}`,
        })),

        paragraphs:
          financials.recentBilling.length === 0
            ? [ctx.copy.empty.noClientBilling]
            : deepLinkExtra(ctx.copy, "/billing"),
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
        { label: ctx.copy.fields.vendor, value: vendor.name, href: `/vendors/${vendor.id}` },

        { label: ctx.copy.fields.kind, value: localizeCode(ctx.locale, vendor.type) },

        { label: ctx.copy.identity.status, value: localizeCode(ctx.locale, vendor.status) },
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

      heading: ctx.copy.sections.subcontracts,

      rows: [
        { label: ctx.copy.fields.activeSubcontracts, value: String(subs.length) },

        {
          label: ctx.copy.fields.cashOutstandingSum,

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

      heading: ctx.copy.sections.subcontracts,

      paragraphs: [
        ctx.copy.empty.noVendorSubcontracts,
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

        heading: ctx.copy.sections.accountsPayable,

        rows: [
          {
            label: ctx.copy.fields.outstanding,

            value: formatMoney(
              money(apSummary.outstanding, apSummary.currency),
              ctx.locale,
            ),

            nature: "cash",
          },

          {
            label: ctx.copy.fields.retentionHeld,

            value: formatMoney(
              money(apSummary.retentionHeld, apSummary.currency),
              ctx.locale,
            ),

            nature: "cash",
          },

          {
            label: ctx.copy.fields.openBills,
            value: String(apSummary.unpaidCount + apSummary.partialCount),
          },
        ],

        paragraphs: deepLinkExtra(ctx.copy, "/procurement/ap/aging"),
      });
    }

    sections.push({
      id: "ap_bills",

      heading: ctx.copy.sections.recentBills,

      rows: vendorBills.slice(0, 15).map((bill) => ({
        label: bill.reference ?? bill.id.slice(0, 8),

        value: `${bill.totalAmount} ${bill.currency} · ${localizeCode(ctx.locale, bill.status)}`,

        nature: "cash" as const,

        href: `/procurement/ap/${bill.id}`,
      })),

      paragraphs:
        vendorBills.length === 0
          ? [ctx.copy.empty.noVendorBills]
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
    { label: ctx.copy.fields.contractsListed, value: String(contracts.length) },

    ...[...byStatus.entries()].map(([status, count]) => ({
      label: `${ctx.copy.identity.status} · ${localizeCode(ctx.locale, status)}`,

      value: String(count),
    })),

    {
      label: ctx.copy.fields.activeContractValueBase,

      value: formatMoney(activeValue, ctx.locale),

      nature: "commercial" as const,
    },
  ];

  const detailRows: ReportRow[] = contracts.slice(0, 40).map((contract) => ({
    label: `${contract.projectName} · ${contract.contractNumber ?? contract.name ?? contract.id.slice(0, 8)}`,

    value: `${localizeCode(ctx.locale, contract.status)} · ${contract.currentAmount ?? "-"} ${contract.currency}`,

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

        heading: ctx.copy.sections.portfolioKpis,

        rows: kpiRows,
      },

      {
        id: "contracts",

        heading: ctx.copy.sections.contractPortfolio,

        rows: detailRows,

        paragraphs:
          contracts.length === 0
            ? [ctx.copy.empty.noContracts]
            : deepLinkExtra(ctx.copy, "/contracts"),
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

    value: `${sub.outstandingAmount} ${sub.currency} ${ctx.copy.phrases.outstanding} · ${localizeCode(ctx.locale, sub.status)}`,

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

        heading: ctx.copy.sections.subcontractCashKpis,

        rows: [
          { label: ctx.copy.fields.agreements, value: String(subs.length) },

          {
            label: ctx.copy.fields.totalOutstandingBase,

            value: formatMoney(totalOutstanding, ctx.locale),

            nature: "cash",
          },

          {
            label: ctx.copy.fields.currentValueBase,

            value: formatMoney(totalCurrent, ctx.locale),

            nature: "committed",
          },
        ],
      },

      {
        id: "subs",

        heading: ctx.copy.sections.subcontractCashView,

        rows,

        paragraphs:
          subs.length === 0
            ? [ctx.copy.empty.noVendorSubcontractsShort]
            : [
                ctx.copy.notices.retentionCashTiming,

                ...deepLinkExtra(ctx.copy, `/vendors/${vendor.id}`),
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

      heading: ctx.copy.sections.utilizationHours,

      rows: [
        { label: ctx.copy.fields.projectHours, value: projectHours.toFixed(2) },

        { label: ctx.copy.fields.nonProjectHours, value: nonProjectHours.toFixed(2) },

        { label: ctx.copy.fields.projectShare, value: `${utilizationPct}%` },

        { label: ctx.copy.fields.timesheetPeriods, value: String(sheets.length) },

        { label: ctx.copy.fields.recordedEntries, value: String(entries.length) },
      ],

      paragraphs: deepLinkExtra(ctx.copy, "/workforce/timesheets"),
    },

    {
      id: "by_project",

      heading: ctx.copy.sections.hoursByProject,

      rows: topProjects.map(([projectId, hours]) => ({
        label: projectId.slice(0, 8),

        value: hours.toFixed(2),

        href: `/projects/${projectId}`,
      })),

      paragraphs:
        topProjects.length === 0
          ? [ctx.copy.empty.noProjectHours]
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

      heading: ctx.copy.sections.laborCostGated,

      rows: [
        {
          label: ctx.copy.fields.entriesWithCostSnapshot,
          value: String(withCost.length),
          nature: "actual",
        },

        {
          label: ctx.copy.fields.sumSnapshottedCost,
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

    notices: [ctx.copy.snapshotNote, ctx.copy.notices.notPayroll],

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
          label: ctx.copy.fields.arOutstanding,

          value: formatMoney(arSummary.totalOutstanding, ctx.locale),

          nature: "cash",
        },

        {
          label: ctx.copy.fields.overdueAr,
          value: formatMoney(arSummary.overdueTotal, ctx.locale),
          nature: "cash",
        },
      );
    }

    if (isPositiveMoney(arRetentionHeld)) {
      arKpi.push({
        label: ctx.copy.fields.retentionHeldAr,

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
        label: ctx.copy.fields.retentionReleaseOutstanding,

        value: formatMoney(arSummary.retentionReleaseOutstanding, ctx.locale),

        nature: "cash",
      });
    }

    if (arKpi.length > 0) {
      sections.push({
        id: "ar_kpi",

        heading: ctx.copy.sections.receivablesRetention,

        rows: arKpi,
      });
    }

    if (arAging) {
      sections.push({
        id: "ar",

        heading: ctx.copy.sections.arAging,

        rows: arAging.buckets.map((bucket) => ({
          label: bucket.key,

          value: formatMoney(bucket.total, ctx.locale),

          nature: "cash" as const,
        })),

        paragraphs: deepLinkExtra(ctx.copy, "/billing"),
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

        heading: ctx.copy.sections.payablesRetention,

        rows: [
          {
            label: ctx.copy.fields.apOutstanding,

            value: formatMoney(
              money(apSummary.outstanding, apSummary.currency),
              ctx.locale,
            ),

            nature: "cash",
          },

          {
            label: ctx.copy.fields.retentionHeldAp,

            value: formatMoney(
              money(apSummary.retentionHeld, apSummary.currency),
              ctx.locale,
            ),

            nature: "cash",
          },
        ],

        paragraphs: deepLinkExtra(ctx.copy, "/procurement/ap/aging"),
      });
    }

    if (apAging) {
      sections.push({
        id: "ap",

        heading: ctx.copy.sections.apAging,

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

      heading: ctx.copy.sections.retentionSchedule,

      paragraphs: [
        ctx.copy.empty.noRetentionAccess,
      ],
    });
  }

  return envelope({
    kind: "retention_schedule",

    locale: ctx.locale,

    generatedAt: ctx.generatedAt,

    identity: orgIdentity(ctx.companyName),

    sections,

    notices: [ctx.copy.snapshotNote, ctx.copy.notices.retentionCashTiming],
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

        heading: ctx.copy.sections.inventoryKpis,

        rows: [
          { label: ctx.copy.fields.activeItems, value: String(items.length) },

          { label: ctx.copy.fields.recentMovements, value: String(movements.length) },

          { label: ctx.copy.fields.atOrBelowReorder, value: String(lowStock.length) },
        ],
      },

      {
        id: "items",

        heading: ctx.copy.sections.inventoryItems,

        rows: items.slice(0, 20).map((item) => ({
          label: item.name ?? item.sku ?? item.id.slice(0, 8),

          value: item.quantityOnHand,

          href: `/assets/inventory/${item.id}`,
        })),

        paragraphs:
          items.length === 0
            ? [ctx.copy.empty.noInventoryItems]
            : undefined,
      },

      {
        id: "moves",

        heading: ctx.copy.sections.recentMovements,

        rows: moveRows,

        paragraphs:
          moveRows.length === 0
            ? [ctx.copy.empty.noInventoryMovements]
            : [
                ctx.copy.empty.quantitiesOnly,

                ...deepLinkExtra(ctx.copy, "/assets/inventory"),
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

          heading: ctx.copy.sections.complianceExpiry,

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

        heading: ctx.copy.sections.complianceKpis,

        rows: [
          { label: ctx.copy.fields.artifactsTracked, value: String(all.length) },

          { label: ctx.copy.fields.expiringSoon, value: String(expiring.length) },

          { label: ctx.copy.fields.expired, value: String(expired.length) },

          ...[...statusCounts.entries()].map(([status, count]) => ({
            label: `${ctx.copy.identity.status} · ${localizeCode(ctx.locale, status)}`,

            value: String(count),
          })),
        ],
      },

      {
        id: "watchlist",

        heading: ctx.copy.sections.expiryWatchlist,

        rows: watchlist.map((artifact) => ({
          label: `${artifact.name} (${artifact.artifactKind})`,

          value: `${localizeCode(ctx.locale, artifact.status)} · ${ctx.copy.phrases.expires} ${artifact.expiresOn ?? "-"}`,

          href: `/compliance/${artifact.id}`,
        })),

        paragraphs:
          watchlist.length === 0
            ? [ctx.copy.empty.noExpiringArtifacts]
            : deepLinkExtra(ctx.copy, "/compliance"),
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

          heading: ctx.copy.sections.crmFunnel,

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

    value: localizeCode(ctx.locale, lead.status),

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

        heading: ctx.copy.sections.pipelineKpis,

        rows: [
          { label: ctx.copy.fields.openOpportunities, value: String(opportunities.length) },

          {
            label: ctx.copy.fields.openLeads,
            value: String(leads.filter((l) => l.status !== "converted").length),
          },

          {
            label: ctx.copy.fields.weightedPipeline,

            value: pipelineValue.toFixed(2),

            nature: "estimate",
          },

          { label: ctx.copy.fields.overdueNextActions, value: String(overdueActions) },
        ],
      },

      {
        id: "stages",

        heading: ctx.copy.sections.funnelByStage,

        rows: stageRows,

        paragraphs: stageRows.every((row) => row.value === "0")
          ? [ctx.copy.empty.noOpenOpportunities]
          : undefined,
      },

      {
        id: "opportunities",

        heading: ctx.copy.sections.openOpportunities,

        rows: topOpps,

        paragraphs: deepLinkExtra(ctx.copy, "/crm"),
      },

      {
        id: "leads",

        heading: ctx.copy.sections.recentLeads,

        rows: leadRows,

        paragraphs: leadRows.length === 0 ? [ctx.copy.empty.noLeads] : undefined,
      },
    ],

    notices: [ctx.copy.snapshotNote, ctx.copy.notices.applicationSnapshot],
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

          heading: ctx.copy.sections.monthCloseCompleteness,

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
    label: localizeCode(ctx.locale, item.key),
    value: item.applicable
      ? item.issueCount === 0
        ? ctx.copy.phrases.pass
        : ctx.copy.phrases.issues.replace('{count}', String(item.issueCount))
      : ctx.copy.phrases.notApplicable,
  }));

  const periodRows: ReportRow[] = workspace.periods
    .slice(0, 6)
    .map((period) => ({
      label: period.yearMonth,

      value: `${localizeCode(ctx.locale, period.status)} · ${period.completenessPercent ?? "-"}%`,

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

        heading: ctx.copy.sections.completenessKpis,

        rows: [
          { label: ctx.copy.fields.targetMonth, value: yearMonth },

          {
            label: ctx.copy.fields.liveCompleteness,

            value: `${liveSnapshot.percent}% (${liveSnapshot.passedCount}/${liveSnapshot.applicableCount} checks)`,
          },

          {
            label: ctx.copy.fields.storedPeriodStatus,

            value: localizeCode(ctx.locale, currentPeriod?.status ?? "not_opened"),
          },
        ],
      },

      {
        id: "checks",

        heading: ctx.copy.sections.completenessChecks,

        rows: checkRows,

        paragraphs:
          liveSnapshot.applicableCount === 0
            ? [ctx.copy.empty.noCompletenessChecks]
            : undefined,
      },

      {
        id: "periods",

        heading: ctx.copy.sections.recentPeriods,

        rows: periodRows,

        paragraphs: [
          ctx.copy.notices.operationalMonthClose,

          ...deepLinkExtra(ctx.copy, "/month-close"),
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

          heading: ctx.copy.sections.openSafetyActions,

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

    value: `${localizeCode(ctx.locale, action.status)}${action.dueDate ? ` · ${ctx.copy.phrases.due} ${action.dueDate}` : ""}`,

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

        heading: ctx.copy.sections.safetyKpis,

        rows: [
          { label: ctx.copy.fields.openRecords, value: String(summary.openRecords) },

          {
            label: ctx.copy.fields.openCorrectiveActions,
            value: String(openActions.length),
          },

          { label: ctx.copy.fields.overdueActions, value: String(overdueCount) },

          {
            label: ctx.copy.fields.criticalHighRecords,
            value: String(
              summary.bySeverity.critical + summary.bySeverity.high,
            ),
          },
        ],
      },

      {
        id: "actions",

        heading: ctx.copy.sections.openCorrectiveActions,

        rows: actionRows,

        paragraphs:
          actionRows.length === 0
            ? [ctx.copy.empty.noOpenCorrectiveActions]
            : deepLinkExtra(ctx.copy, "/safety"),
      },
    ],

    notices: [ctx.copy.snapshotNote, ctx.copy.notices.applicationReport],
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
