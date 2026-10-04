import type { AddressValue } from "@repo/types";
import { addressRequestSignal, type AddressResolveContext, type AddressSearchContext, type AddressSuggestion, type ServerAddressProvider } from "./provider";

type GeoapifyProperties = {
  place_id?: string; formatted?: string; address_line1?: string; address_line2?: string;
  street?: string; housenumber?: string; postcode?: string; city?: string; town?: string;
  village?: string; county?: string; state?: string; country?: string; country_code?: string;
  lat?: number; lon?: number; feature_type?: string;
};

export function geoapifyPropertiesToAddress(properties: GeoapifyProperties, saveCoordinates = true): AddressValue {
  const address: AddressValue = {
    formatted: String(properties.formatted || properties.address_line1 || "").trim(),
    street: properties.street,
    number: properties.housenumber,
    postalCode: properties.postcode,
    city: properties.city || properties.town || properties.village || properties.county,
    province: properties.state || properties.county,
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

function responseProperties(payload: any): GeoapifyProperties[] {
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.features)) return payload.features.map((feature: any) => feature?.properties).filter(Boolean);
  return [];
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
      return responseProperties(await response.json()).flatMap((item): AddressSuggestion[] => {
        if (!item.place_id || !item.formatted) return [];
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

