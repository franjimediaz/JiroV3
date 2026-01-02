"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { usePerms, type Accion } from "@/lib/perms";

export function RequirePerms({
  modulo,
  accion = "ver",
  children,
}: {
  modulo: string;
  accion?: Accion;
  children: React.ReactNode;
}) {
  const { loading, hasPermiso } = usePerms();
  const router = useRouter();
  const pathname = usePathname();

  const allowed = !loading && hasPermiso(modulo, accion);

  useEffect(() => {
    if (pathname === "/403") return;

    if (!loading && !allowed) {
      router.replace("/403");
      // fallback duro
      setTimeout(() => {
        if (window.location.pathname !== "/403") window.location.assign("/403");
      }, 50);
    }
  }, [loading, allowed, router, pathname]);

  if (loading) return null;
  if (!allowed) return null;
  return <>{children}</>;
}
