// /apps/web/actions/seed-modulos.ts
"use server";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { MODULOS_SEED, type SeedNode } from "@/lib/seed/modulos.seed";
import { createClient as createServerClient } from "@/lib/supabase/server";

const TABLE = "modulos";

async function upsertModulo(node: SeedNode, parentId: string | null) {
  let q = supabaseAdmin.from(TABLE)
    .select("id")
    .eq("slug", node.slug)
    .limit(1);

  // ✅ usar .is solo cuando es null; si no, .eq
  if (parentId === null) {
    q = q.is("parent_id", null);
  } else {
    q = q.eq("parent_id", parentId);
  }

  const { data: existing, error: findErr } = await q.maybeSingle();
  if (findErr) throw new Error(`Find failed: ${findErr.message}`);

  const payload = {
    parent_id: parentId,
    nombre: node.nombre,
    slug: node.slug,
    tipo: node.tipo,
    orden: node.orden ?? 0,
    activo: node.activo ?? true,
    props: node.props ?? {},
  };

  if (!existing) {
    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(`Insert failed: ${error.message}`);
    return data!.id as string;
  } else {
    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .update(payload)
      .eq("id", existing.id)
      .select("id")
      .single();
    if (error) throw new Error(`Update failed: ${error.message}`);
    return data!.id as string;
  }
}


async function walk(nodes: SeedNode[], parentId: string | null) {
  for (const n of nodes) {
    const id = await upsertModulo(n, parentId);
    if (n.children?.length) await walk(n.children, id);
  }
}

export async function seedModulosAction(): Promise<{ ok: boolean; detail: string }> {
  try {
    // 1) Usuario autenticado
    const supabaseUser = await createServerClient();
    const { data: { user }, error: authErr } = await supabaseUser.auth.getUser();
    if (authErr) return { ok: false, detail: `Auth error: ${authErr.message}` };
    if (!user) return { ok: false, detail: "No autenticado." };

    // 2) Rol por service-role (evita RLS)
    const { data: perfil, error: roleErr } = await supabaseAdmin
      .from("users")
      .select("role")
      .eq("uid", user.id)
      .maybeSingle();
    if (roleErr) return { ok: false, detail: `Error leyendo rol: ${roleErr.message}` };
    if (!perfil?.role) return { ok: false, detail: "Tu usuario no tiene rol asignado en 'users'." };
    if (perfil.role !== "systemadmin") return { ok: false, detail: "Permisos insuficientes (se requiere 'systemadmin')." };

    // 3) Ejecutar seed
    await walk(MODULOS_SEED, null);

    return { ok: true, detail: "Seed completado correctamente." };
  } catch (e: any) {
    // Captura de errores de DB/validación
    return { ok: false, detail: e?.message ?? "Fallo inesperado en el seed." };
  }
}
