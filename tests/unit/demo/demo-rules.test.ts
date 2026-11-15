import { describe, expect, it } from "vitest";
import { computeProfitPosition } from "@/modules/financials/domain/profit";
import { money, toNumericString } from "@/shared/money";
import { isDemoOrganization } from "@/modules/demo/domain/demo-org";
import { shouldRecordEmployeeLockout } from "@/modules/demo/domain/employee-lockout";
import { isDemoMintedEmail, mayDeleteDemoIdentity } from "@/modules/demo/domain/identity-rule";
import { isLibraryFileAllowed, libraryMayStart, tokenIncludesWriteScope } from "@/modules/demo/domain/library-policy";
import { decideResetAction, resetRunIsComplete } from "@/modules/demo/domain/reset-decision";
import { isJerusalemResetHour, jerusalemHour } from "@/modules/demo/domain/reset-clock";
import { parseDemoRoleSwitch } from "@/modules/demo/domain/role-switch";
import { activeProjectContractNet, activeProjectCostNet, buildDemoFixture, DEMO_FIXTURE_KEYS } from "@/modules/demo/fixtures/fixture-builder";

describe("demo rules", () => {
  it("accepts only a role key", () => {
    expect(parseDemoRoleSwitch({ roleKey: "owner" }).ok).toBe(true);
    expect(parseDemoRoleSwitch({ roleKey: "owner", userId: "x" }).ok).toBe(false);
    expect(parseDemoRoleSwitch({ email: "a@b.c" }).ok).toBe(false);
    expect(parseDemoRoleSwitch({ roleKey: "admin" }).ok).toBe(false);
  });

  it("opens the nightly run only at 03:00 Jerusalem", () => {
    expect(jerusalemHour(new Date("2026-07-15T00:00:00Z"))).toBe(3);
    expect(jerusalemHour(new Date("2026-01-15T01:00:00Z"))).toBe(3);
    expect(isJerusalemResetHour(new Date("2026-07-15T01:00:00Z"))).toBe(false);
    expect(isJerusalemResetHour(new Date("2026-01-15T00:00:00Z"))).toBe(false);
  });

  it("resumes a failed run and does not open a second day", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    expect(decideResetAction({ existing: null, now, resetHour: true })).toBe("create");
    expect(decideResetAction({ existing: null, now, resetHour: false })).toBe("skip");
    expect(decideResetAction({ existing: { status: "completed", leaseUntil: null }, now, resetHour: false })).toBe("exit");
    expect(
      decideResetAction({
        existing: { status: "running", leaseUntil: new Date("2099-01-01T00:00:00Z") },
        now,
        resetHour: false,
      }),
    ).toBe("exit");
    expect(decideResetAction({ existing: { status: "failed", leaseUntil: null }, now, resetHour: false })).toBe("resume");
  });

  it("completes only when every saved item is completed", () => {
    expect(resetRunIsComplete([])).toBe(false);
    expect(resetRunIsComplete(["completed", "pending"])).toBe(false);
    expect(resetRunIsComplete(["completed", "completed"])).toBe(true);
  });

  it("refuses write scopes and files outside the library root", () => {
    expect(tokenIncludesWriteScope(["drive"])).toBe(true);
    expect(tokenIncludesWriteScope(["https://www.googleapis.com/auth/drive.readonly"])).toBe(false);
    expect(libraryMayStart(["drive.readonly"])).toBe(true);
    expect(libraryMayStart([])).toBe(false);
    expect(isLibraryFileAllowed("a", new Set(["a"]))).toBe(true);
    expect(isLibraryFileAllowed("b", new Set(["a"]))).toBe(false);
  });

  it("deletes only a demo-minted identity whose memberships are in the deleting set", () => {
    expect(isDemoMintedEmail("abc.owner@demo.pf.internal")).toBe(true);
    expect(isDemoMintedEmail("demo.org.employee@employees.pf.internal")).toBe(true);
    expect(isDemoMintedEmail("real.person@employees.pf.internal")).toBe(false);
    expect(mayDeleteDemoIdentity({ email: "abc.owner@demo.pf.internal", membershipOrganizationIds: ["s"], deletingOrganizationIds: new Set(["s"]) })).toBe(true);
    expect(mayDeleteDemoIdentity({ email: "abc.owner@demo.pf.internal", membershipOrganizationIds: ["real"], deletingOrganizationIds: new Set(["s"]) })).toBe(false);
    expect(mayDeleteDemoIdentity({ email: "abc.owner@demo.pf.internal", membershipOrganizationIds: [], deletingOrganizationIds: new Set(["s"]) })).toBe(true);
    expect(mayDeleteDemoIdentity({ email: "real.person@employees.pf.internal", membershipOrganizationIds: [], deletingOrganizationIds: new Set(["s"]) })).toBe(false);
  });

  it("does not lock a real employee account from a demo browser", () => {
    expect(shouldRecordEmployeeLockout({ pinVerified: false, demoSessionPresent: false, accountOrganizationIsDemo: false })).toBe(false);
    expect(shouldRecordEmployeeLockout({ pinVerified: true, demoSessionPresent: true, accountOrganizationIsDemo: false })).toBe(false);
    expect(shouldRecordEmployeeLockout({ pinVerified: true, demoSessionPresent: false, accountOrganizationIsDemo: false })).toBe(true);
  });

  it("builds every onboarding profile with linked profit numbers", () => {
    expect(DEMO_FIXTURE_KEYS).toHaveLength(20);
    expect(isDemoOrganization(null)).toBe(false);
    expect(isDemoOrganization("session")).toBe(true);
    for (const key of DEMO_FIXTURE_KEYS) {
      const fixture = buildDemoFixture(key);
      expect(fixture.projects.length).toBeGreaterThanOrEqual(4);
      expect(fixture.clients.length).toBeGreaterThanOrEqual(3);
      expect(fixture.employees.length).toBeGreaterThanOrEqual(4);
      expect(activeProjectContractNet(fixture)).toBe("237000.00");
      expect(activeProjectCostNet(fixture)).toBe("66900.00");
      const position = computeProfitPosition(
        money(activeProjectContractNet(fixture), "ILS"),
        money(activeProjectCostNet(fixture), "ILS"),
      );
      expect(Number(toNumericString(position.actualProfit))).toBe(170100);
    }
  });
});
