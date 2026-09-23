import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { badRequest } from "@/lib/auth/apiError";
import { handleApiError } from "@/lib/auth/handleApiError";
import { requireModulePermission } from "@/lib/auth/requireModulePermission";
import { resolveModuleConfig, type ResolvedModuleConfig } from "@/lib/modules/resolveModuleConfig";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const IDENTIFIER_PATTERN = /^[a-zA-Z0-9_]+$/;

function stringFromBody(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function assertIdentifier(value: string, label: string) {
  if (!IDENTIFIER_PATTERN.test(value)) {
    throw badRequest(`${label} invalido`);
  }
}

function assertAllowedLabelField(resolved: ResolvedModuleConfig, labelField: string) {
  const declaredFields = new Set((resolved.schema.fields || []).map((field) => field.name));
  if (declaredFields.has(labelField) || labelField === resolved.primaryKey || labelField === "id") return;

  throw badRequest(`labelField no declarado en schema: ${labelField}`);
}

async function resolveLabelsModule(moduleKey: string) {
  try {
    return await resolveModuleConfig(moduleKey);
  } catch {
    throw badRequest("Modulo no valido");
  }
}

export async function POST(req: Request) {
  const requestId = crypto.randomUUID();
  let moduleSlug = "";

  try {
    const body = (await req.json().catch(() => null)) as any;
    const requestedModuleSlug = stringFromBody(body?.moduleSlug);
    const legacyTable = stringFromBody(body?.table);
    const moduleKey = requestedModuleSlug || legacyTable;
    const requestedLabelField = stringFromBody(body?.labelField);
    const ids = Array.isArray(body?.ids)
      ? body.ids.map((id: unknown) => String(id).trim()).filter(Boolean)
      : [];

    if (!moduleKey) {
      throw badRequest("moduleSlug es requerido");
    }

    assertIdentifier(moduleKey, "moduleSlug");

    const resolved = await resolveLabelsModule(moduleKey);
    moduleSlug = resolved.slug;

    if (!resolved.table) {
      throw badRequest("Este modulo no es un modulo de datos");
    }

    if (legacyTable && legacyTable !== resolved.table && legacyTable !== resolved.slug) {
      throw badRequest("Tabla no permitida");
    }

    const labelField = requestedLabelField || resolved.displayField || "id";
    assertIdentifier(labelField, "labelField");
    assertAllowedLabelField(resolved, labelField);
    await requireModulePermission(resolved.permissionsKey, "ver");

    if (ids.length === 0) {
      return NextResponse.json({ ok: true, map: {}, requestId });
    }

    const supabase = await createClient();
    const idField = resolved.primaryKey || "id";
    const selectFields = Array.from(new Set([idField, labelField])).join(",");

    const { data, error } = await supabase
      .from(resolved.table)
      .select(selectFields)
      .in(idField, ids);

    if (error) {
      throw new Error(error.message);
    }

    const map: Record<string, string> = {};
    for (const row of data || []) {
      const id = String((row as any)[idField]);
      const label = (row as any)[labelField];
      map[id] = label == null ? id : String(label);
    }

    return NextResponse.json({ ok: true, map, requestId });
  } catch (error) {
    return handleApiError(error, requestId, { route: "/api/dp/labels", method: "POST", moduleSlug });
  }
}
