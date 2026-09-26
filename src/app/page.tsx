import { getSessionUser } from "@/server/auth";
import { getUserWithSettings } from "@/server/services/auth-service";
import { AppRoot } from "@/components/app-root";
import type { SessionDTO } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Page() {
  let initialSession: SessionDTO | null = null;
  try {
    const user = await getSessionUser();
    if (user) {
      initialSession = await getUserWithSettings(user.id);
    }
  } catch {
    // db not ready — render auth gate; client will retry
  }
  return <AppRoot initialSession={initialSession} />;
}
