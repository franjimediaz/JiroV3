"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { RequirePerms } from "@/lib/perms";
import { upsertModuloAction } from "@/actions/modulos";
import {ModuloForm} from "@repo/ui";

export default function FormModules({
  initialData,
  mode,
  loadFieldsForTable,
}: {
  initialData: any;
  mode: "view" | "edit" | "create";
  loadFieldsForTable?: (tableSlug: string) => Promise<{ name: string; label?: string; type?: string }[]>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const onSave = async (fd: FormData) => {
    const res = await upsertModuloAction(fd);

    // aquí repones la navegación que quitaste del core
    if (res.ok && res.id) {
      const sp = new URLSearchParams(searchParams.toString());
      sp.set("edit", "false");
      router.replace(`/system/modulos/${res.id}?${sp.toString()}`);
      router.refresh();
    }
    return res;
  };
  

  return (
    <RequirePerms modulo="modulos" accion="actualizar">
      <ModuloForm initialData={initialData} mode={mode} onSave={onSave} loadFieldsForTable={loadFieldsForTable} />
    </RequirePerms>
  );
}
