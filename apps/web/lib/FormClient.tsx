"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseTreeViewProvider } from "@/lib/utils/treeViewProvider";
import { createClient } from "@/lib/supabase/client";
import { Form } from "@repo/ui";
import type { ModuleSchema } from "@repo/types";
import { RequirePerms, usePerms } from "@/lib/perms";

type Mode = "view" | "edit" | "create";

// -----------------------------
// Utils: sanitize + payload
// -----------------------------
function sanitize(values: any, schema: ModuleSchema) {
  const { meta, ...rest } = values || {};
  const out: any = { ...rest };

  for (const f of schema.fields || []) {
    const v = out[f.name];

    if (f.type === "multiselect") {
      if (v === "" || v === undefined) out[f.name] = [];
      if (typeof v === "string") {
        out[f.name] = v
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean);
      }
    }

    if (f.name === "created_at" || f.name === "updated_at") {
      delete out[f.name];
      continue;
    }

    if (v === "") out[f.name] = null;
  }

  return out;
}

function pickPersistablePayload(values: any, schema: ModuleSchema) {
  const allowed = new Set(
    (schema.fields || [])
      .filter((f) => f.virtual !== true)
      .filter((f) => !(f.compute && (f.compute as any).persist === "none"))
      .map((f) => f.name)
  );

  const out: Record<string, any> = {};
  for (const k of allowed) out[k] = values?.[k];

  delete out.meta;
  delete out.created_at;
  delete out.updated_at;

  return out;
}

// -----------------------------
// Resolver: módulo/ruta/tabla
// -----------------------------
type ModulesBySlug = Record<
  string,
  {
    route?: string | null;
    ui?: { route?: string | null };
    db?: { table?: string; primaryKey?: string };
  }
>;

function resolveFromSchemaAndModules(args: {
  schema: ModuleSchema;
  moduleSlug?: string; // preferente si lo conoces en la ruta (m/[slug]/...)
  modulesBySlug?: ModulesBySlug;
  fallbackRoute?: string;
}) {
  const schemaTable = args.schema?.db?.table;
  const schemaPk = args.schema?.db?.primaryKey;

  // 1) elegir slug base (si viene por props/ruta, úsalo)
  let slug = args.moduleSlug || "";

  // 2) si no viene, intenta resolverlo por schemaTable dentro de modulesBySlug
  if (!slug && args.modulesBySlug && schemaTable) {
    // match por slug
    if (args.modulesBySlug[schemaTable]) slug = schemaTable;
    // match por db.table
    if (!slug) {
      for (const [s, mod] of Object.entries(args.modulesBySlug)) {
        if (mod?.db?.table === schemaTable) {
          slug = s;
          break;
        }
      }
    }
  }

  // 3) fallback final: si no hay slug, usa schemaTable o "unknown"
  if (!slug) slug = schemaTable || "unknown";

  // 4) table & pk reales
  const mod = args.modulesBySlug?.[slug];
  const table = schemaTable || mod?.db?.table || slug;
  const primaryKey = schemaPk || mod?.db?.primaryKey || "id";

  // 5) route base
  const routeRaw =
    args.fallbackRoute ||
    mod?.route ||
    mod?.ui?.route ||
    (args.schema as any)?.route ||
    (args.schema as any)?.ui?.route ||
    `/${slug}/`;

  const baseRoute = String(routeRaw).replace(/\/?$/, "/");

  return { slug, table, primaryKey, baseRoute };
}

function accionPorModo(mode: Mode) {
  if (mode === "view") return "ver";
  if (mode === "edit") return "actualizar";
  return "crear";
}

// -----------------------------
// Componente
// -----------------------------
export default function FormClient({
  schema,
  initialData,
  mode,
  // Si estás en rutas dinámicas /m/[slug]/..., pásalo para resolver todo perfecto:
  moduleSlug,
  // Si ya sabes la ruta (server), pásala para no depender de modulesBySlug
  baseRoute,
  // Opcionales para resolución avanzada (treeview, rutas, etc.)
  modulesBySlug,
  schemasBySlug,
}: {
  schema: ModuleSchema;
  initialData: any;
  mode: Mode;

  moduleSlug?: string;
  baseRoute?: string;

  modulesBySlug?: ModulesBySlug;
  schemasBySlug?: Record<string, ModuleSchema>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, start] = useTransition();
  const { hasPermiso, loading } = usePerms();

  const treeViewProvider = useMemo(() => createSupabaseTreeViewProvider(), []);

  const resolved = useMemo(
    () =>
      resolveFromSchemaAndModules({
        schema,
        moduleSlug,
        modulesBySlug,
        fallbackRoute: baseRoute,
      }),
    [schema, moduleSlug, modulesBySlug, baseRoute]
  );

  const requiredAction = accionPorModo(mode);

  const onSubmit = (values: any) => {
    start(async () => {
      try {
        // 1) check UX permiso (la RLS también manda, pero esto evita clicks tontos)
        if (!hasPermiso(resolved.slug, requiredAction as any)) {
          alert("No tienes permisos para esta acción.");
          return;
        }

        const supabase = createClient();
        const sanitized = sanitize(values, schema);
        const payload = pickPersistablePayload(sanitized, schema);

        // 2) update / insert
        if (mode === "edit") {
          const id = initialData?.[resolved.primaryKey];
          if (!id) throw new Error("Falta el ID para editar");

          const { error } = await supabase
            .from(resolved.slug)
            .update(payload)
            .eq(resolved.primaryKey, id);

          if (error) throw error;

          // limpiar ?edit=true
          const qs = new URLSearchParams(searchParams.toString());
          qs.delete("edit");
          router.replace(`?${qs.toString()}`);
          router.refresh();
          return;
        }

        if (mode === "create") {
          // insert y volver al detalle
          // Nota: si tu PK es uuid autogenerado, necesitarás .select() para obtenerlo
          const { data, error } = await supabase
            .from(resolved.slug)
            .insert(payload)
            .select("*")
            .maybeSingle();

          if (error) throw error;
          const newId = (data as any)?.[resolved.primaryKey] ?? (data as any)?.id;
          if (!newId) {
            // fallback: refresca y listo
            router.refresh();
            return;
          }

          router.push(`${resolved.baseRoute}${newId}`);
          router.refresh();
          return;
        }

        // view no debería llamar a submit
      } catch (err: any) {
        console.error("Submit error:", err?.message ?? err, err);
        alert(err?.message ?? "Error guardando");
      }
    });
  };

  // opcional: botones custom de volver/editar (si no los quieres, los quitas)
  const onBack = () => router.back();
  const onEdit = () => {
    // Si estás en view, al editar añade ?edit=true
    const url = new URL(window.location.href);
    url.searchParams.set("edit", "true");
    router.push(url.toString());
  };

  if (loading) return null;

  return (
    <RequirePerms modulo={resolved.slug} accion={requiredAction as any}>
      <div style={{ opacity: pending ? 0.7 : 1 }}>
        <Form
          schema={schema}
          initialData={initialData}
          recordId={initialData?.[resolved.primaryKey] ?? initialData?.id}
          moduleSlug={resolved.slug}
          mode={mode}
          onSubmit={onSubmit}
          onBack={onBack}
          onEdit={onEdit}
          // treeview
          modulesBySlug={modulesBySlug}
          schemasBySlug={schemasBySlug}
          treeViewProvider={treeViewProvider}
          treeViewParentRecord={initialData}
        />
      </div>
    </RequirePerms>
  );
}
