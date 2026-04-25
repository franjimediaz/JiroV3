import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveModuleConfig } from "@/lib/modules/resolveModuleConfig";

type Body = {
  moduleSlug?: string;
  table?: string;
  data?: Record<string, any>;
};

export async function POST(req: Request) {
  try {
    const supabase = await createClient();

    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData?.user) {
      return NextResponse.json({ ok: false, detail: "No autenticado" }, { status: 401 });
    }

    const body = (await req.json()) as Body;
    const moduleSlug = body.moduleSlug?.trim();
    const legacyTable = body.table?.trim();
    const payload = body.data;

    if (!moduleSlug && !legacyTable) {
      return NextResponse.json({ ok: false, detail: "Falta 'moduleSlug'" }, { status: 400 });
    }
    if (!payload || typeof payload !== "object") {
      return NextResponse.json({ ok: false, detail: "Falta 'data' (object)" }, { status: 400 });
    }

    const resolved = await resolveModuleConfig(moduleSlug || legacyTable || "");
    if (!resolved.table) {
      return NextResponse.json({ ok: false, detail: "Este modulo no es un modulo de datos" }, { status: 400 });
    }
    if (legacyTable && legacyTable !== resolved.table && legacyTable !== resolved.slug) {
      return NextResponse.json({ ok: false, detail: `Tabla legacy no permitida: ${legacyTable}` }, { status: 400 });
    }

    const allowedFields = new Set(
      (resolved.schema.fields || [])
        .filter((field) => field.virtual !== true)
        .map((field) => field.name)
    );
    const unknownFields = Object.keys(payload).filter(
      (key) => !allowedFields.has(key) && key !== resolved.primaryKey && key !== "id"
    );
    if (unknownFields.length > 0) {
      return NextResponse.json(
        { ok: false, detail: `Campos no declarados en schema: ${unknownFields.join(", ")}` },
        { status: 400 }
      );
    }

    const { data: created, error } = await supabase
      .from(resolved.table)
      .insert(payload)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ ok: false, detail: error.message }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      id: created?.[resolved.primaryKey] ?? created?.id,
      record: created,
      legacyTableAccepted: !!legacyTable && !moduleSlug,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, detail: e?.message || "Error creando registro" },
      { status: 500 }
    );
  }
}
