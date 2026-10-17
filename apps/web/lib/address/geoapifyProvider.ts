import type { AddressValue } from "@repo/types";
import { addressRequestSignal, type AddressResolveContext, type AddressSearchContext, type AddressSuggestion, type ServerAddressProvider } from "./provider";

type GeoapifyProperties = {
  place_id?: string; formatted?: string; address_line1?: string; address_line2?: string;
  street?: string; housenumber?: string; postcode?: string; city?: string; town?: string;
  village?: string; county?: string; state?: string; country?: string; country_code?: string;
  lat?: number; lon?: number; feature_type?: string; result_type?: string;
};

// Small, process-local handoff between autocomplete and resolve. No client payload
// is trusted, and a cold instance can still resolve the official place ID.
const recentAddresses = new Map<string, { address: AddressValue; expires: number }>();
const cacheTtlMs = 5 * 60_000;
const cacheLimit = 256;

function remember(key: string, address: AddressValue) {
  const now = Date.now();
  for (const [id, entry] of recentAddresses) {
    if (entry.expires <= now) recentAddresses.delete(id);
  }
  recentAddresses.delete(key);
  recentAddresses.set(key, { address, expires: now + cacheTtlMs });
  while (recentAddresses.size > cacheLimit) recentAddresses.delete(recentAddresses.keys().next().value!);
}

export function geoapifyPropertiesToAddress(properties: GeoapifyProperties, saveCoordinates = true): AddressValue {
  const address: AddressValue = {
    formatted: String(properties.formatted || properties.address_line1 || "").trim(),
    street: properties.street,
    number: properties.housenumber,
    postalCode: properties.postcode,
    city: properties.city || properties.town || properties.village || properties.county,
    province: properties.county || properties.state,
    country: properties.country,
    countryCode: properties.country_code?.toUpperCase(),
    provider: "geoapify",
    providerId: properties.place_id,
  };
  if (saveCoordinates && Number.isFinite(properties.lat) && Number.isFinite(properties.lon)) {
    address.lat = properties.lat;
    address.lng = properties.lon;
  }
  return Object.fromEntries(Object.entries(address).filter(([, value]) => value !== undefined && value !== "")) as AddressValue;
}

function responseProperties(payload: unknown): GeoapifyProperties[] {
  if (!payload || typeof payload !== "object") return [];
  const response = payload as { results?: unknown; features?: unknown };
  const items: unknown[] = Array.isArray(response.results) ? response.results
    : Array.isArray(response.features) ? response.features.map((feature: unknown) =>
      feature && typeof feature === "object" && "properties" in feature ? feature.properties : null) : [];
  return items.flatMap(item => {
    if (!item || typeof item !== "object") return [];
    const source = item as Record<string, unknown>;
    const properties: GeoapifyProperties = {};
    for (const key of ["place_id", "formatted", "address_line1", "address_line2", "street", "housenumber", "postcode", "city", "town", "village", "county", "state", "country", "country_code", "result_type"] as const) {
      if (typeof source[key] === "string") properties[key] = source[key];
    }
    for (const key of ["lat", "lon"] as const) {
      if (typeof source[key] === "number" && Number.isFinite(source[key])) properties[key] = source[key];
    }
    return [properties];
  });
}

export function createGeoapifyProvider(apiKey = process.env.GEOAPIFY_API_KEY): ServerAddressProvider {
  if (!apiKey) throw new Error("GEOAPIFY_API_KEY no está configurada");
  return {
    name: "geoapify",
    async search(query: string, context: AddressSearchContext = {}) {
      const url = new URL("https://api.geoapify.com/v1/geocode/autocomplete");
      url.searchParams.set("text", query);
      url.searchParams.set("format", "json");
      url.searchParams.set("limit", "7");
      url.searchParams.set("lang", "es");
      if (context.countries?.length) url.searchParams.set("filter", `countrycode:${context.countries.map(country => country.toLowerCase()).join(",")}`);
      url.searchParams.set("apiKey", apiKey);
      const response = await fetch(url, { cache: "no-store", signal: addressRequestSignal(context.signal) });
      if (!response.ok) throw new Error(`Geoapify autocomplete respondió ${response.status}`);
      const items = responseProperties(await response.json());
      // Keep provider relevance within each group, but prefer postal addresses.
      items.sort((a, b) => Number(Boolean(b.street)) - Number(Boolean(a.street)));
      const seen = new Set<string>();
      return items.flatMap((item): AddressSuggestion[] => {
        if (!item.place_id || !item.formatted) return [];
        if (seen.has(item.place_id) || item.result_type === "country" || item.result_type === "state") return [];
        seen.add(item.place_id);
        remember(`${apiKey}:${item.place_id}`, geoapifyPropertiesToAddress(item));
        return [{
          id: item.place_id,
          label: item.address_line1 || item.formatted,
          secondaryLabel: item.address_line2,
          attribution: [
            { label: "Powered by Geoapify", url: "https://www.geoapify.com/" },
            { label: "© OpenStreetMap contributors", url: "https://www.openstreetmap.org/copyright" },
          ],
        }];
      });
    },
    async resolve(id: string, context: AddressResolveContext = {}) {
      context.signal?.throwIfAborted();
      const key = `${apiKey}:${id}`;
      const cached = recentAddresses.get(key);
      if (cached && cached.expires > Date.now()) {
        const address = { ...cached.address };
        if (context.saveCoordinates === false) { delete address.lat; delete address.lng; }
        return address;
      }
      recentAddresses.delete(key);
      const url = new URL("https://api.geoapify.com/v2/place-details");
      url.searchParams.set("id", id);
      url.searchParams.set("features", "details");
      url.searchParams.set("lang", "es");
      url.searchParams.set("apiKey", apiKey);
      const response = await fetch(url, { cache: "no-store", signal: addressRequestSignal(context.signal) });
      if (!response.ok) throw new Error(`Geoapify place details respondió ${response.status}`);
      const properties = responseProperties(await response.json())[0];
      if (!properties) throw new Error("Geoapify no devolvió una dirección utilizable");
      const address = geoapifyPropertiesToAddress({ ...properties, place_id: properties.place_id || id }, context.saveCoordinates !== false);
      if (!address.formatted) throw new Error("Geoapify no devolvió una dirección utilizable");
      return address;
    },
  };
}

