"use client";

import React, { useMemo, useState } from "react";
import type { ModuleSchema } from "@repo/types";
import { ActionMenu } from "../ActionMenu";
import { applyCompute } from "../engines/computeEngine"; // ajusta ruta real si difiere
import { dataProvider } from "../providers/DataProvider"; // ajusta ruta real si difiere
import { downloadPdf, openPdfInNewTab, openPdfInSameTab } from "../pdf";
import { evaluateActionVisibility } from "../engines/visibilityEngine";
import type { VisibilityConfig } from "@repo/types";

type Mode = "view" | "edit" | "create";

/** ---------------- Types (config) ---------------- */

export type FormAction =
  | CreateRelatedAction
  | NavigateAction
  | RecalculateAction
  | DuplicateAction
  | ExternalAction
  | WorkflowAction;

type BaseAction = {
  id: string;
  label: string;
  icon?: string; // ej: "bi bi-plus-lg"
  variant?:
    | "primary"
    | "secondary"
    | "success"
    | "warning"
    | "danger"
    | "info"
    | "light"
    | "dark";
  showIn?: Mode[]; // default: ["view","edit","create"]
  confirm?: { title?: string; text: string };
  disabledWhen?: DisabledWhen;
  visibility?: VisibilityConfig;
  // opcional: posicionarlo (por si luego quieres header/footer)
  placement?: "top" | "bottom";
};

type DisabledWhen =
  | { type: "missingFields"; fields: string[] } // si faltan -> disabled
  | { type: "modeIs"; modes: Mode[] };

export type CreateRelatedAction = BaseAction & {
  type: "createRelated";
  target: {
    table: string; // tabla destino
    moduleSlug?: string; // si prefieres navegar por módulo
  };
  /** Mapeo origen->destino: { destino: "campoOrigen" } */
  fieldMap?: Record<string, string>;
  /** Defaults en destino: { campoDestino: "valor fijo" } */
  defaults?: Record<string, any>;
  /** Si true, navega tras crear */
  afterCreate?: {
    navigateTo?: "record" | "list" | "none";
    /** plantilla opcional si quieres forzar ruta */
    hrefTemplate?: string; // ej "/obras/{{obraId}}/tareas/{{id}}?edit=true"
    openEdit?: boolean; // si navega a record, añade ?edit=true
  };
};

export type NavigateAction = BaseAction & {
  type: "navigate";
  target: {
    table?: string; // navegación por tabla (si tu router es por tabla)
    moduleSlug?: string; // o por módulo
  };
  hrefTemplate: string; // ej "/tareas/new?obraId={{id}}" o "/tabla/{{target.table}}?f={{id}}"
};

export type RecalculateAction = BaseAction & {
  type: "recalculate";
};

export type DuplicateAction = BaseAction & {
  type: "duplicate";
  /** copia el registro actual (mismos campos) */
  includeChildren?: boolean;
  /** define qué campos NO duplicar */
  omitFields?: string[]; // ej ["id","createdAt","updatedAt"]
  afterDuplicate?: {
    navigateTo?: "record" | "list" | "none";
    openEdit?: boolean;
  };
};

export type ExternalAction = BaseAction & {
  type: "external";
  kind: "pdf" | "email" | "print" | "custom";
  endpoint: string;
  open?: "tab" | "same";
  params?: Record<string, any>;
};

export type WorkflowAction = BaseAction & {
  type: "workflow";
  workflowKey: string;

  /**
   * input se guarda en el schema y se envía al backend.
   * Ej: { source: {...}, target: {...}, maps: {...}, defaults: {...} }
   */
  input?: any;

  /**
   * navegación opcional tras ejecutar:
   * Ej: "/presupuestos/{{result.id}}?view=1"
   */
  after?: {
    navigateTo?: string; // template
  };
};

function tplString(v: any, ctx: any) {
  if (typeof v !== "string") return v;
  return v.replace(/\{\{(.*?)\}\}/g, (_, k) => {
    const key = String(k).trim();
    return ctx?.[key] ?? "";
  });
}

function deepTpl(obj: any, ctx: any): any {
  if (Array.isArray(obj)) return obj.map((x) => deepTpl(x, ctx));
  if (obj && typeof obj === "object") {
    const out: any = {};
    for (const [k, v] of Object.entries(obj)) out[k] = deepTpl(v, ctx);
    return out;
  }
  return tplString(obj, ctx);
}

function isTruthyValue(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "1" || normalized === "true" || normalized === "yes";
  }
  return false;
}

/** ---------------- Component Props ---------------- */

export default function FormActionsBar(props: {
  schema: ModuleSchema;
  mode: Mode;
  /** valores actuales del formulario (lo que estás editando/viendo) */
  values: any;
  /** callback para actualizar valores si una acción recalcula o cambia algo */
  setValues?: (next: any) => void;
  /** helper para navegar (si no pasas, usa window.location) */
  navigate?: (href: string) => void;
  resolveRoute?: (source: string) => string | null;
  /** acciones configuradas desde schema.ui.formActions */
  actions?: FormAction[];
  /** contexto opcional */
  context?: {
    /** tabla actual (origen) */
    table?: string;
  };
  relatedRecordsByField?: Record<string, any>;
}) {
  const {
    schema,
    mode,
    values,
    setValues,
    navigate,
    resolveRoute,
    actions = [],
    relatedRecordsByField,
  } = props;

  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const effectiveActions = useMemo(() => {
    const list = Array.isArray(actions) ? actions : [];
    return list.filter((a) => {
      const showIn = a.showIn?.length
        ? a.showIn
        : (["view", "edit", "create"] as Mode[]);
      if (!showIn.includes(mode)) return false;

      try {
        return evaluateActionVisibility({
          action: a,
          values,
          schema,
          relatedRecordsByField,
        });
      } catch (e) {
        console.warn("Error evaluando visibilidad de acción", a?.id, e);
        return false;
      }
    });
  }, [actions, mode, values, schema, relatedRecordsByField]);

  const go = (href: string) => {
    if (navigate) return navigate(href);
    if (typeof window !== "undefined") window.location.href = href;
  };

  const buildBaseRoute = (source: string) => {
    const base = resolveRoute?.(source) || `/${source}`;
    return base.endsWith("/") ? base.slice(0, -1) : base;
  };

  const buildRecordHref = (source: string, id: string, openEdit?: boolean) => {
    const edit = openEdit ? "?edit=true" : "";
    return `${buildBaseRoute(source)}/${id}${edit}`;
  };

  const buildListHref = (source: string) => buildBaseRoute(source);

  const isDisabled = (a: FormAction) => {
    const dw = (a as any).disabledWhen as DisabledWhen | undefined;
    if (!dw) return false;

    if (dw.type === "modeIs") {
      return dw.modes.includes(mode);
    }
    if (dw.type === "missingFields") {
      return dw.fields.some(
        (f) =>
          values?.[f] === undefined ||
          values?.[f] === null ||
          values?.[f] === "",
      );
    }
    return false;
  };

  const confirmIfNeeded = (a: FormAction) => {
    if (!a.confirm?.text) return true;
    const title = a.confirm.title || "Confirmación";
    return window.confirm(`${title}\n\n${a.confirm.text}`);
  };

  function getByPath<T = unknown>(obj: unknown, path: string): T | undefined {
    return path.split(".").reduce<unknown>((acc, key) => {
      if (acc && typeof acc === "object" && key in acc) {
        return (acc as Record<string, unknown>)[key];
      }
      return undefined;
    }, obj) as T | undefined;
  }

  const resolveTemplate = (tpl: string, ctx: Record<string, unknown>) =>
    tpl.replace(/\{\{([\w.]+)\}\}/g, (_, path) => {
      const val = getByPath(ctx, path);
      return val == null ? "" : String(val);
    });

  const handleAction = async (a: FormAction) => {
    setError(null);
    if (isDisabled(a)) return;

    const ok = confirmIfNeeded(a);
    if (!ok) return;

    setBusyId(a.id);
    try {
      if (a.type === "recalculate") {
        const computed = await applyCompute({
          schema: schema as any,
          record: values,
          dataProvider,
        });
        setValues?.(computed);
        return;
      }

      if (a.type === "navigate") {
        const ctx = { ...values, target: a.target };
        const href = resolveTemplate(a.hrefTemplate, ctx);
        go(href);
        return;
      }

      if (a.type === "createRelated") {
        const payload: Record<string, any> = {
          ...(a.defaults || {}),
        };

        if (a.fieldMap) {
          for (const [destField, srcFieldPath] of Object.entries(a.fieldMap)) {
            const srcVal = getByPath(values, srcFieldPath);
            if (srcVal !== undefined) payload[destField] = srcVal;
          }
        }

        const created = await (dataProvider as any).create?.({
          table: a.target.table,
          data: payload,
        });

        if (!created) {
          throw new Error(
            "dataProvider.create no devolvió resultado (¿falta implementarlo?).",
          );
        }

        const createdId =
          created?.id ?? created?.data?.id ?? created?.record?.id;
        const after = a.afterCreate || { navigateTo: "record", openEdit: true };
        const source = a.target.moduleSlug || a.target.table;

        if (after.navigateTo === "none") return;

        if (after.hrefTemplate) {
          const href = resolveTemplate(after.hrefTemplate, {
            ...values,
            created,
            id: createdId,
          });
          go(href);
          return;
        }

        if (after.navigateTo === "record") {
          go(buildRecordHref(source, String(createdId), after.openEdit));
          return;
        }

        go(buildListHref(source));
        return;
      }

      if (a.type === "duplicate") {
        const omit = new Set([...(a.omitFields || []), "id"]);
        const clone: Record<string, any> = {};
        Object.keys(values || {}).forEach((k) => {
          if (omit.has(k)) return;
          if (k === "meta") return;
          clone[k] = values[k];
        });

        const table = (schema as any)?.db?.table;
        if (!table) {
          throw new Error(
            "schema.db.table no está definido, no sé dónde duplicar.",
          );
        }

        const created = await (dataProvider as any).create?.({
          table,
          data: clone,
        });
        if (!created) {
          throw new Error(
            "No se pudo duplicar: dataProvider.create no devolvió resultado.",
          );
        }

        const createdId =
          created?.id ?? created?.data?.id ?? created?.record?.id;

        const after = a.afterDuplicate || {
          navigateTo: "record",
          openEdit: true,
        };
        if (after.navigateTo === "none") return;

        if (after.navigateTo === "record") {
          const edit = after.openEdit ? "?edit=true" : "";
          go(`/${table}/${createdId}${edit}`);
          return;
        }

        go(`/${table}`);
        return;
      }

      if (a.type === "external") {
        const ext = ((a as any).external ?? a) as any;
        const kind = ext.kind as string | undefined;
        const paramsObj = (a as any).params ?? ext.params ?? {};
        const endpoint =
          ext.endpoint || (a as any).endpoint || "/api/pdf/generate";
        const open = ext.open || (a as any).open || "tab";

        if (kind === "pdf") {
          const ctx = { ...values, id: values?.id };
          const params = deepTpl(
            {
              template: ext.pdf?.templateSlug,
              id: ext.pdf?.recordIdTemplate,
              ...paramsObj,
            },
            ctx,
          ) as Record<string, unknown>;
          const template = String(params.template || "").trim();
          const recordId = String(params.id || "").trim();

          if (!template || !recordId) {
            throw new Error(
              "La acción PDF requiere params.template y params.id para construir la URL.",
            );
          }

          if (isTruthyValue(params.download)) {
            downloadPdf(template, recordId, endpoint, params);
            return;
          }

          if (open === "same") {
            openPdfInSameTab(template, recordId, endpoint, params);
            return;
          }

          openPdfInNewTab(template, recordId, endpoint, params);
          return;
        }

        return;
      }

      if (a.type === "workflow") {
        const recordId = String(values?.id || "");
        if (!recordId) {
          throw new Error(
            "No hay id del registro. Esta acción requiere un registro ya guardado.",
          );
        }

        if (!a.workflowKey) {
          throw new Error("workflowKey requerido en la acción workflow.");
        }

        const payload = {
          workflowKey: a.workflowKey,
          context: {
            recordId,
            tableSlug: (schema as any)?.slug || (schema as any)?.db?.table,
          },
          input: a.input || {},
        };

        const res = await fetch("/api/workflows/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload),
        });

        const json = await res.json().catch(() => null);

        if (!res.ok || !json?.ok) {
          throw new Error(json?.error || `Workflow error (${res.status})`);
        }

        const tpl = (a as any).after?.navigateTo;
        if (tpl) {
          const href = resolveTemplate(String(tpl), {
            ...values,
            result: json.result,
            meta: json.meta,
          });
          if (href) go(href);
        }

        return;
      }
    } catch (e: any) {
      setError(e?.message || "Error ejecutando acción");
    } finally {
      setBusyId(null);
    }
  };

  if (effectiveActions.length === 0) return null;

  return (
    <div className="d-flex flex-column gap-2">
      <div className="d-flex flex-wrap gap-2 justify-content-end">
        <ActionMenu
          items={effectiveActions.map((a) => {
            const busy = busyId === a.id;

            return {
              label: busy ? "Procesando..." : a.label,
              icon: a.icon ? (
                <i className={a.icon} style={{ marginRight: 8 }} />
              ) : undefined,
              onClick: () => handleAction(a),
            };
          })}
        />
      </div>

      {error && <div className="alert alert-danger py-2 mb-0">{error}</div>}
    </div>
  );
}
