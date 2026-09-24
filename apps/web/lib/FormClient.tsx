"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseTreeViewProvider } from "@/lib/utils/treeViewProvider";
import { Form } from "@repo/ui";
import { getEffectiveModuleCapabilities, isModuleActionAvailable } from "@repo/types";
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

async function postMutation(path: "/api/create" | "/api/update", body: Record<string, unknown>) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  const json = text ? JSON.parse(text) : {};

  if (!response.ok || !json?.ok) {
    const message = json?.error?.message || json?.detail || json?.error || text || "Error guardando";
    throw new Error(String(message));
  }

  return json;
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
  schemasByTable,
}: {
  schema: ModuleSchema;
  initialData: any;
  mode: Mode;

  moduleSlug?: string;
  baseRoute?: string;

  modulesBySlug?: ModulesBySlug;
  schemasBySlug?: Record<string, ModuleSchema>;
  schemasByTable?: Record<string, ModuleSchema>;
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

  const capabilities = getEffectiveModuleCapabilities(schema);
  const canEdit = isModuleActionAvailable(schema, "actualizar", hasPermiso(resolved.slug, "actualizar" as any));
  const effectiveMode: Mode = mode === "edit" && !canEdit ? "view" : mode;
  const requiredAction = accionPorModo(effectiveMode);
  const capabilityAllowed =
    effectiveMode === "create" ? capabilities.allowCreate :
    effectiveMode === "edit" ? capabilities.allowEdit :
    true;

  const onSubmit = (values: any) => {
    start(async () => {
      try {
        // 1) check UX permiso (la RLS también manda, pero esto evita clicks tontos)
        if (!capabilityAllowed || !hasPermiso(resolved.slug, requiredAction as any)) {
          alert("No tienes permisos para esta acción.");
          return;
        }

        const sanitized = sanitize(values, schema);
        const payload = pickPersistablePayload(sanitized, schema);

        // 2) update / insert
        if (effectiveMode === "edit") {
          const id = initialData?.[resolved.primaryKey];
          if (!id) throw new Error("Falta el ID para editar");

          await postMutation("/api/update", {
            moduleSlug: resolved.slug,
            id,
            data: payload,
          });

          // limpiar ?edit=true
          const qs = new URLSearchParams(searchParams.toString());
          qs.delete("edit");
          router.replace(`?${qs.toString()}`);
          router.refresh();
          return;
        }

        if (effectiveMode === "create") {
          // insert y volver al detalle
          // Nota: si tu PK es uuid autogenerado, necesitarás .select() para obtenerlo
          const result = await postMutation("/api/create", {
            moduleSlug: resolved.slug,
            data: payload,
          });
          const newId = result?.id ?? result?.record?.[resolved.primaryKey] ?? result?.record?.id;
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
    if (!canEdit) return;
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
          mode={effectiveMode}
          onSubmit={onSubmit}
          onBack={onBack}
          canEdit={canEdit}
          onEdit={canEdit ? onEdit : undefined}
          // treeview
          modulesBySlug={modulesBySlug}
          schemasBySlug={schemasBySlug}
          schemasByTable={schemasByTable}
          treeViewProvider={treeViewProvider}
          treeViewParentRecord={initialData}
        />
      </div>
    </RequirePerms>
  );
}
