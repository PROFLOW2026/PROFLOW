import { cookies } from "next/headers";
import { switchDemoRoleAction } from "@/modules/demo/application/actions";
import { openDemoSessionCookie } from "@/modules/demo/application/session-cookie";
import { DEMO_ROLE_KEYS } from "@/modules/demo/domain/demo-org";
import { DemoLocalMarker } from "./demo-local-marker";

const ROLE_LABELS: Record<(typeof DEMO_ROLE_KEYS)[number], string> = {
  owner: "בעלים",
  manager: "מנהל",
  finance: "כספים",
  worker: "עובד שטח",
  employee: "עובדים",
  contractor: "קבלנים",
};

export async function DemoModeBanner({ active }: { active: boolean }) {
  if (!active) return null;
  const current = openDemoSessionCookie((await cookies()).get("demo_session")?.value);
  return (
    <div
      role="status"
      data-demo-banner="active"
      className="flex flex-col items-center gap-2 bg-amber-100 px-4 py-2 text-center text-sm font-medium text-amber-950 sm:flex-row sm:justify-center"
    >
      <DemoLocalMarker />
      <span>מצב הדגמה — הנתונים מתאפסים מדי לילה</span>
      {current ? (
        <form action={switchDemoRoleAction} className="flex items-center gap-2">
          <label className="sr-only" htmlFor="demo-role-switch">
            תפקיד
          </label>
          <select id="demo-role-switch" name="roleKey" defaultValue={current.roleKey} className="min-h-11 rounded border bg-white px-2">
            {DEMO_ROLE_KEYS.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </select>
          <button type="submit" className="min-h-11 rounded border border-amber-950 px-3">
            החלפת תפקיד
          </button>
        </form>
      ) : null}
    </div>
  );
}
