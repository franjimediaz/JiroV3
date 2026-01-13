import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server"; // ajusta la ruta a tu helper

type Body = {
  table?: string;
  data?: Record<string, any>;
};

export async function POST(req: Request) {
  try {
    const supabase = await createClient();

    // opcional pero útil: garantizar que hay sesión
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData?.user) {
      return NextResponse.json(
        { ok: false, detail: "No autenticado" },
        { status: 401 }
      );
    }

    const body = (await req.json()) as Body;
    const table = body.table?.trim();
    const data = body.data;

    if (!table) {
      return NextResponse.json({ ok: false, detail: "Falta 'table'" }, { status: 400 });
    }
    if (!data || typeof data !== "object") {
      return NextResponse.json({ ok: false, detail: "Falta 'data' (object)" }, { status: 400 });
    }

    // Whitelist.
    {/** const ALLOWED_TABLES = new Set([
      "obras",
      "task",
      "servicios",
      "materiales",
      "presupuestos",
      "facturas",
      "clientes",
      "users",
      "modulos_config",
      // ... añade las tuyas
    ]);

    if (!ALLOWED_TABLES.has(table)) {
      return NextResponse.json(
        { ok: false, detail: `Tabla no permitida: ${table}` },
        { status: 400 }
      );
    }*/}

    // Insert y devolvemos el registro creado
    const { data: created, error } = await supabase
      .from(table)
      .insert(data)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json(
        { ok: false, detail: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true, id: created?.id, record: created });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, detail: e?.message || "Error creando registro" },
      { status: 500 }
    );
  }
}
