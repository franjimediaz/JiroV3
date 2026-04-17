"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { ListView } from "@repo/ui";
import type { ListViewExportPayload, ModuleSchema } from "@repo/types";
import { useRouter } from "next/navigation";
import { RequirePerms, usePerms } from "@/lib/perms";
import { createClient } from "@/lib/supabase/client";
import { useConfirm } from "@/lib/hooks/useConfirm";
import {
  buildCsvContent,
  buildCsvFilename,
  buildImportPreview,
  downloadCsv,
  formatFieldValueForExport,
  parseCsv,
  readTextFile,
} from "@/lib/listDataIO";

export default function ListPageClient({
  schema,
  rows,
  moduleSlug,
  baseRoute,
  titleSingular,
  modulesBySlug,
}: {
  schema: ModuleSchema;
  rows: any[];
  moduleSlug: string;
  baseRoute: string;
  titleSingular: string;
  modulesBySlug?: Record<string, any>;
}) {
  const router = useRouter();
  const { loading, hasPermiso } = usePerms();
  const { confirm, modal, inform } = useConfirm();
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const primaryKey = schema.db.primaryKey || "id";

  const handleDelete = async (row: any) => {
    if (!hasPermiso(moduleSlug, "eliminar")) {
      await inform({
        title: "Accion no permitida",
        message: `No tienes permisos para eliminar este ${titleSingular}.`,
        details: [{ label: "Accion", value: "Eliminar" }, { label: "Modulo", value: titleSingular }],
        mode: "info",
        confirmText: "Aceptar",
      });
      return;
    }

    const ok = await confirm({
      title: `Eliminar ${titleSingular}`,
      message: "Esta accion no se puede deshacer.",
      details: [{ label: "ID", value: row?.[primaryKey] }],
      confirmText: "Eliminar",
      cancelText: "Cancelar",
      danger: true,
    });
    if (!ok) return;

    const supabase = createClient();
    const { error } = await supabase.from(moduleSlug).delete().eq(primaryKey, row?.[primaryKey]);
    if (error) {
      alert(`No se pudo eliminar: ${error.message}`);
      return;
    }

    router.refresh();
  };

  const handleView = async (row: any) => {
    if (!hasPermiso(moduleSlug, "ver")) {
      await inform({
        title: "Accion no permitida",
        message: `No tienes permisos para ver este ${titleSingular}.`,
        details: [{ label: "Accion", value: "Ver" }, { label: "ID", value: row?.[primaryKey] }],
        mode: "info",
        confirmText: "Aceptar",
      });
      return;
    }

    router.push(`${baseRoute.replace(/\/?$/, "/")}${row?.[primaryKey]}`);
  };

  const handleEdit = async (row: any) => {
    if (!hasPermiso(moduleSlug, "actualizar")) {
      await inform({
        title: "Accion no permitida",
        message: `No tienes permisos para editar este ${titleSingular}.`,
        details: [{ label: "Accion", value: "Editar" }, { label: "ID", value: row?.[primaryKey] }],
        mode: "info",
        confirmText: "Aceptar",
      });
      return;
    }

    router.push(`${baseRoute.replace(/\/?$/, "/")}${row?.[primaryKey]}?edit=true`);
  };

  const handleCreate = async () => {
    if (!hasPermiso(moduleSlug, "crear")) {
      await inform({
        title: "Accion no permitida",
        message: `No tienes permisos para crear un nuevo ${titleSingular}.`,
        details: [{ label: "Accion", value: "Crear" }, { label: "Modulo", value: titleSingular }],
        mode: "info",
        confirmText: "Aceptar",
      });
      return;
    }

    router.push(`${baseRoute.replace(/\/?$/, "/")}new`);
  };

  const handleExport = async (payload: ListViewExportPayload) => {
    if (!hasPermiso(moduleSlug, "exportar")) {
      await inform({
        title: "Accion no permitida",
        message: `No tienes permisos para exportar ${titleSingular}.`,
        details: [{ label: "Accion", value: "Exportar" }, { label: "Modulo", value: titleSingular }],
        mode: "info",
        confirmText: "Aceptar",
      });
      return;
    }

    if (!payload.rawRows.length) {
      await inform({
        title: "Sin datos para exportar",
        message: "La vista actual no tiene registros para exportar.",
        details: [{ label: "Modulo", value: titleSingular }],
        mode: "info",
        confirmText: "Aceptar",
      });
      return;
    }

    const exportRows = payload.rawRows.map((row) =>
      Object.fromEntries(
        (schema.fields || []).map((field) => [
          field.name,
          formatFieldValueForExport(row?.[field.name], field),
        ])
      )
    );

    try {
      setExporting(true);
      downloadCsv(
        buildCsvFilename(moduleSlug, schema),
        buildCsvContent(
          (schema.fields || []).map((field) => ({ name: field.name, label: field.name })),
          exportRows,
          ";"
        )
      );
    } finally {
      setExporting(false);
    }
  };

  const handleImport = async () => {
    if (!hasPermiso(moduleSlug, "importar")) {
      await inform({
        title: "Accion no permitida",
        message: `No tienes permisos para importar registros en ${titleSingular}.`,
        details: [{ label: "Accion", value: "Importar" }, { label: "Modulo", value: titleSingular }],
        mode: "info",
        confirmText: "Aceptar",
      });
      return;
    }

    importInputRef.current?.click();
  };

  const handleImportFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".csv")) {
      await inform({
        title: "Formato no soportado",
        message: "Por ahora solo se admite importacion de archivos CSV delimitados por punto y coma.",
        details: [{ label: "Archivo", value: file.name }],
        mode: "info",
        confirmText: "Aceptar",
      });
      return;
    }

    try {
      setImporting(true);

      const text = await readTextFile(file);
      const parsed = parseCsv(text, ";");
      const preview = buildImportPreview({
        schema,
        headers: parsed.headers,
        rows: parsed.rows,
      });

      if (preview.errors.length) {
        await inform({
          title: "No se pudo importar el archivo",
          message: "Revisa el formato y las columnas del CSV antes de intentarlo de nuevo.",
          details: preview.errors.slice(0, 8).map((error, index) => ({
            label: `Error ${index + 1}`,
            value: error,
          })),
          mode: "info",
          confirmText: "Aceptar",
        });
        return;
      }

      if (!preview.payloads.length) {
        await inform({
          title: "Sin filas para importar",
          message: "El archivo no contiene registros validos para insertar.",
          details: [{ label: "Archivo", value: file.name }],
          mode: "info",
          confirmText: "Aceptar",
        });
        return;
      }

      const supabase = createClient();
      for (const batch of chunk(preview.payloads, 100)) {
        const { error } = await supabase.from(moduleSlug).insert(batch);
        if (error) throw error;
      }

      await inform({
        title: "Importacion completada",
        message: `Se importaron ${preview.payloads.length} registros correctamente.`,
        details: [
          { label: "Archivo", value: file.name },
          { label: "Modulo", value: titleSingular },
        ],
        mode: "info",
        confirmText: "Aceptar",
      });

      router.refresh();
    } catch (error: any) {
      await inform({
        title: "Error al importar",
        message: error?.message || "No se pudo completar la importacion.",
        details: [{ label: "Archivo", value: file.name }],
        mode: "info",
        confirmText: "Aceptar",
      });
    } finally {
      setImporting(false);
    }
  };

  void modulesBySlug;

  if (loading) return null;

  return (
    <RequirePerms modulo={moduleSlug} accion="ver">
      <>
        {modal}
        <ListView
          schema={schema}
          data={rows}
          onViewRow={handleView}
          onEditRow={handleEdit}
          onDeleteRow={handleDelete}
          onCreate={handleCreate}
          onExport={handleExport}
          onImport={handleImport}
          exportLoading={exporting}
          importLoading={importing}
        />
        <input
          ref={importInputRef}
          type="file"
          accept=".csv,text/csv"
          hidden
          onChange={handleImportFileChange}
        />
      </>
    </RequirePerms>
  );
}

function chunk<T>(items: T[], size: number) {
  const output: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    output.push(items.slice(index, index + size));
  }
  return output;
}
