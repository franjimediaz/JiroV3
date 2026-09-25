import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { hasPermission } from "@/lib/auth/requirePermission";
import { fetchModuleRows } from "@/lib/modules/resolveModuleConfig";
import { resolveModuleDestinations } from "@/lib/modules/moduleRoutes";
import { buildDashboardModuleGroups } from "./dashboard-model";
import { Dashboard, DashboardSkeleton } from "./Dashboard";

export const dynamic = "force-dynamic";

async function DashboardContent() {
  const rowsPromise = fetchModuleRows().then(
    (rows) => ({ rows }),
    () => ({ rows: null }),
  );
  const ctx = await getCurrentUser();
  if (!ctx) redirect("/login");
  try {
    const { rows } = await rowsPromise;
    if (!rows) throw new Error("No se pudieron cargar los módulos");
    const groups = buildDashboardModuleGroups(
      rows,
      (slug, action = "ver") => hasPermission(ctx, `${slug}.${action}`),
      resolveModuleDestinations(rows),
    );
    return (
      <Dashboard
        groups={groups}
        email={ctx.user.email || "Cuenta sin correo"}
        loadError={false}
      />
    );
  } catch {
    return (
      <Dashboard
        groups={[]}
        email={ctx.user.email || "Cuenta sin correo"}
        loadError
      />
    );
  }
}

export default function Home() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardContent />
    </Suspense>
  );
}
