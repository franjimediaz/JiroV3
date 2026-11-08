import { redirect } from "next/navigation";
import { isModuleActionAvailable } from "@repo/types";
import { ApiError, forbidden } from "@/lib/auth/apiError";
import { requireModulePermission } from "@/lib/auth/requireModulePermission";
import { fetchModuleRowBySlug } from "@/lib/modules.server";

export async function requireReportsAccess(action: "ver" | "crear" | "actualizar" | "eliminar" = "ver") {
  const ctx = await requireModulePermission("report_definitions", "ver");
  if (action !== "ver") await requireModulePermission("report_definitions", action);
  const { schema } = await fetchModuleRowBySlug("report_definitions");
  if (action !== "ver" && !isModuleActionAvailable(schema, action, true)) throw forbidden();
  return { ctx, schema };
}

export async function reportsPageAccess(action: "ver" | "crear" | "actualizar" = "ver") {
  try {
    return await requireReportsAccess(action);
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) redirect("/403");
    if (error instanceof ApiError && error.status === 401) redirect("/login");
    throw error;
  }
}
