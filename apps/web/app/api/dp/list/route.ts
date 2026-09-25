import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveModuleConfig } from "@/lib/modules/resolveModuleConfig";
import { requireModulePermission } from "@/lib/auth/requireModulePermission";
import { handleApiError } from "@/lib/auth/handleApiError";
import { applyAuditTrailDefaultOrder, enrichAuditTrailRows } from "@/lib/audit/auditTrailRows";

export async function GET(req: Request) {
  const requestId = crypto.randomUUID();
  let moduleSlug = "";

  try {
    const { searchParams } = new URL(req.url);

    moduleSlug = searchParams.get("moduleSlug") || "";
    const q = searchParams.get("q") || "";
    const limit = Math.min(Number(searchParams.get("limit") || "30"), 100);
    const displayField = searchParams.get("displayField") || "name";

    if (!moduleSlug) {
      return NextResponse.json({ error: "moduleSlug requerido" }, { status: 400 });
    }

    await requireModulePermission(moduleSlug, "ver");
    const resolved = await resolveModuleConfig(moduleSlug);
    if (!resolved.table) {
      return NextResponse.json({ error: "Este modulo no es un modulo de datos" }, { status: 400 });
    }
    if (resolved.permissionsKey !== moduleSlug) {
      await requireModulePermission(resolved.permissionsKey, "ver");
    }
    const declaredFields = new Set((resolved.schema.fields || []).map((field) => field.name));
    const selectedDisplayField = declaredFields.has(displayField) ? displayField : resolved.displayField || "id";

    if (!declaredFields.has(selectedDisplayField) && selectedDisplayField !== resolved.primaryKey && selectedDisplayField !== "id") {
      return NextResponse.json(
        { error: `displayField no declarado en schema: ${displayField}` },
        { status: 400 }
      );
    }

    let queryClient: any = await createClient();
    if (resolved.readMode === "server") {
      const { supabaseAdmin } = await import("@/lib/supabase/admin");
      queryClient = supabaseAdmin;
    }

    let query = queryClient.from(resolved.table).select("*");
    query = applyAuditTrailDefaultOrder(resolved.table, query);
    query = query.limit(limit);

    if (q.trim()) {
      query = query.ilike(selectedDisplayField, `%${q.trim()}%`);
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ tableName: resolved.table, error }, { status: 500 });
    }

    const rows = await enrichAuditTrailRows(resolved.table, data ?? []);
    return NextResponse.json({ tableName: resolved.table, moduleSlug: resolved.slug, data: rows });
  } catch (error) {
    return handleApiError(error, requestId, { route: "/api/dp/list", method: "GET", moduleSlug });
  }
}
