"use client";

import type { SidebarItem } from "@repo/ui";
import { Sidebar } from "@repo/ui";
import { usePerms } from "@/lib/perms";

export function SidebarWithPerms(props: {
  items: SidebarItem[];
  variant: "fixed" | "offcanvas";
  offcanvasId?: string;
  title?: string;
}) {
  const { loading, hasPermiso } = usePerms();

  const canView = (slug: string) => {
    if (loading) return false;
    return hasPermiso(slug, "ver");
  };

  return <Sidebar {...props} canView={canView} />;
}
