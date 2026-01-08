// treeViewProvider.ts
// ✅ Esto va en tu APP (no en @repo/ui). Aquí sí puedes usar Supabase o fetch.

import { createClient } from "@/lib/supabase/client";

type TreeViewQuery = {
  table: string;
  select: string[];
  filters?: Array<
    | { op: "eq"; field: string; value: any }
    | { op: "in"; field: string; value: any[] }
  >;
  orderBy?: { field: string; ascending?: boolean };
};

type LookupQuery = {
  table: string;
  valueField: string;
  ids: string[];
  select: string[];
};

export type TreeViewDataProvider = {
  list: (query: TreeViewQuery) => Promise<any[]>;
  lookup?: (query: LookupQuery) => Promise<any[]>;
  remove?: (table: string, id: string) => Promise<void>;
};

function safeParseSelect(select: string[]) {
  // Supabase espera string tipo: "id,title,icon,color"
  // También admite "*,rel(*)" pero aquí mantenemos simple.
  return select.join(",");
}

function applyFilters(q: any, filters?: TreeViewQuery["filters"]) {
  if (!filters?.length) return q;

  for (const f of filters) {
    if (f.op === "eq") {
      // evita filtrar por undefined
      if (f.value === undefined) continue;
      q = q.eq(f.field, f.value);
    }

    if (f.op === "in") {
      if (!Array.isArray(f.value) || f.value.length === 0) continue;
      q = q.in(f.field, f.value);
    }
  }
  return q;
}

export function createSupabaseTreeViewProvider(): TreeViewDataProvider {
  const supabase = createClient();

  return {
    // ---------------- list ----------------
    async list({ table, select, filters, orderBy }) {
      let q = supabase.from(table).select(safeParseSelect(select));

      q = applyFilters(q, filters);

      if (orderBy?.field) {
        q = q.order(orderBy.field, { ascending: orderBy.ascending ?? true });
      }

      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },

    // ---------------- lookup ----------------
    async lookup({ table, valueField, ids, select }) {
      if (!ids?.length) return [];

      // Importante: ids como string; si tu id es uuid funciona perfecto
      const q = supabase
        .from(table)
        .select(safeParseSelect(select))
        .in(valueField, ids);

      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },

    // ---------------- remove ----------------
    async remove(table, id) {
      const { error } = await supabase.from(table).delete().eq("id", id);
      if (error) throw error;
    },
  };
}
