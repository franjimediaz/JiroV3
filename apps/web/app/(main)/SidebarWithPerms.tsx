"use client";

import { useCallback } from "react";
import type { SidebarItem, SidebarModuleSelection } from "@repo/ui";
import { Sidebar } from "@repo/ui";
import { usePerms } from "@/lib/perms";

export function SidebarWithPerms(props: {
  items: SidebarItem[];
  variant: "fixed" | "drawer";
  title?: string;
  isOpen?: boolean;
  onClose?: () => void;
  miniMode?: boolean;
  onToggleMini?: () => void;
  moduleSelection?: SidebarModuleSelection | null;
  onModuleChange?: (selection: SidebarModuleSelection) => void;
}) {
  const { loading, hasPermiso } = usePerms();

  const canView = useCallback((slug: string) => {
    if (loading) return false;
    return hasPermiso(slug, "ver");
  }, [loading, hasPermiso]);

  return <Sidebar {...props} canView={canView} />;
}
