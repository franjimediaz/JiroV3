import type { AddressValue } from "@repo/types";

export type AddressAttribution = { label: string; url: string };
export type AddressSuggestion = { id: string; label: string; secondaryLabel?: string; attribution?: AddressAttribution[] };
export type AddressSearchOptions = { countries?: string[]; sessionId?: string; signal?: AbortSignal };
export type AddressResolveOptions = { saveCoordinates?: boolean; sessionId?: string; signal?: AbortSignal };

export interface AddressProvider {
  search(query: string, options?: AddressSearchOptions): Promise<AddressSuggestion[]>;
  resolve(id: string, options?: AddressResolveOptions): Promise<AddressValue>;
}

async function post<T>(body: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch("/api/address", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error?.message || "No se pudo consultar el proveedor de direcciones");
  return payload;
}

export const defaultAddressProvider: AddressProvider = {
  async search(query, options = {}) {
    const payload = await post<{ suggestions: AddressSuggestion[] }>({ action: "search", query, countries: options.countries, sessionId: options.sessionId }, options.signal);
    const seen = new Set<string>();
    return payload.suggestions.filter(suggestion => {
      const key = suggestion.id || suggestion.label.trim().toLocaleLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  },
  async resolve(id, options = {}) {
    const payload = await post<{ address: AddressValue }>({ action: "resolve", id, saveCoordinates: options.saveCoordinates, sessionId: options.sessionId }, options.signal);
    return payload.address;
  },
};

