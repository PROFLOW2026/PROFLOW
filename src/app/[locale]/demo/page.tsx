import { notFound } from "next/navigation";
import { getBusinessProfile } from "@/modules/tenancy/domain/business-profiles";
import { ONBOARDING_BUSINESS_TYPES } from "@/modules/tenancy/domain/onboarding-experience";
import { enterDemoAction } from "@/modules/demo/application/actions";
import { isDemoEntryEnabled } from "@/modules/demo/application/flags";
import { DEMO_ROLE_KEYS } from "@/modules/demo/domain/demo-org";

const ROLE_LABELS: Record<(typeof DEMO_ROLE_KEYS)[number], string> = {
  owner: "בעלים",
  manager: "מנהל",
  finance: "כספים",
  worker: "עובד שטח",
  employee: "אפליקציית עובדים",
  contractor: "אפליקציית קבלנים",
};

export default function DemoEntryPage() {
  if (!isDemoEntryEnabled()) notFound();
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col gap-6 px-4 py-10">
      <h1 className="text-2xl font-bold">הדגמה</h1>
      <p>בחרו סוג עסק ותפקיד. הנתונים סינתטיים ומתאפסים בכל לילה.</p>
      <form action={enterDemoAction} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          סוג העסק
          <select name="profileKey" required className="min-h-11 rounded border px-2">
            {ONBOARDING_BUSINESS_TYPES.map((key) => (
              <option key={key} value={key}>
                {getBusinessProfile(key)?.domains[0]?.nameHe ?? key}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          תפקיד
          <select name="roleKey" required className="min-h-11 rounded border px-2">
            {DEMO_ROLE_KEYS.map((key) => (
              <option key={key} value={key}>
                {ROLE_LABELS[key]}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="min-h-11 rounded bg-black px-4 text-white">
          כניסה לדמו
        </button>
      </form>
    </main>
  );
}
