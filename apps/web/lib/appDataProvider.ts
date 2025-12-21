import type { DataProvider } from "@repo/ui"; 

export const appDataProvider: DataProvider = {
  async aggregate(input, record) {
    
    return 0;
  },

  async list({ moduleSlug, q, limit = 30, displayField }: any) {
    const params = new URLSearchParams();
    params.set("moduleSlug", moduleSlug);
    params.set("q", q || "");
    params.set("limit", String(limit));
    if (displayField) params.set("displayField", displayField);

    const r = await fetch(`/api/dp/list?${params.toString()}`, {
      credentials: "include",
    });

    const json = await r.json();
    if (!r.ok) return { data: [], error: json?.error || json };

    return { data: json.data || [], error: null };
  },
};
