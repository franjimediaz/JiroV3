import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  buildDashboardModules,
  featuredModules,
  type ModuleRow,
} from "./dashboard-model";
import { Dashboard, DashboardSkeleton } from "./Dashboard";

export const dynamic = "force-dynamic";

async function DashboardContent() {
  const supabase = await createClient();
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();
  if (error || !session?.user) redirect("/login");

  const { data, error: modulesError } = await supabase
    .from("modulos")
    .select("id,slug,nombre,route,activo,orden,parent_id,props,tipo")
    .eq("activo", true)
    .order("orden", { ascending: true })
    .order("nombre", { ascending: true });

  const modules = buildDashboardModules((data ?? []) as ModuleRow[]);
  const featured = featuredModules(modules);
  await Promise.all(
    featured.map(async (item) => {
      if (!item.table || !item.canCount) return;
      try {
        const { count, error: countError } = await supabase
          .from(item.table)
          .select("*", { count: "exact", head: true })
          .abortSignal(AbortSignal.timeout(5000));
        item.count =
          !countError && typeof count === "number" && Number.isFinite(count)
            ? count
            : null;
      } catch {
        item.count = null;
      }
    }),
  );

  return (
    <Dashboard
      modules={modules}
      featured={featured}
      email={session.user.email || "Cuenta sin correo"}
      loadError={Boolean(modulesError)}
    />
  );
}

export default function Home() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardContent />
    </Suspense>
  );
}
