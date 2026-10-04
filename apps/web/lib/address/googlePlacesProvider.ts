import type { AddressValue } from "@repo/types";
import { addressRequestSignal, type AddressResolveContext, type AddressSearchContext, type AddressSuggestion, type ServerAddressProvider } from "./provider";

type GoogleComponent = { longText?: string; shortText?: string; types?: string[] };

function component(components: GoogleComponent[] | undefined, ...types: string[]) {
  return components?.find(item => types.some(type => item.types?.includes(type)));
}

export function googlePlaceToAddress(place: any, saveCoordinates: boolean): AddressValue {
  const components = Array.isArray(place?.addressComponents) ? place.addressComponents as GoogleComponent[] : [];
  const country = component(components, "country");
  const result: AddressValue = {
    formatted: String(place?.formattedAddress || "").trim(),
    street: component(components, "route")?.longText,
    number: component(components, "street_number")?.longText,
    postalCode: component(components, "postal_code")?.longText,
    city: component(components, "locality", "postal_town", "administrative_area_level_2")?.longText,
    province: component(components, "administrative_area_level_1")?.longText,
    country: country?.longText,
    countryCode: country?.shortText?.toUpperCase(),
    provider: "google",
    providerId: typeof place?.id === "string" ? place.id : undefined,
  };
  if (saveCoordinates && Number.isFinite(place?.location?.latitude) && Number.isFinite(place?.location?.longitude)) {
    result.lat = place.location.latitude;
    result.lng = place.location.longitude;
  }
  return Object.fromEntries(Object.entries(result).filter(([, value]) => value !== undefined && value !== "")) as AddressValue;
}

export function createGooglePlacesProvider(apiKey = process.env.GOOGLE_PLACES_API_KEY): ServerAddressProvider {
  function headers(fieldMask: string) {
    if (!apiKey) throw new Error("GOOGLE_PLACES_API_KEY no está configurada");
    return { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": fieldMask };
  }
  return {
    name: "google",
    async search(query: string, context: AddressSearchContext = {}) {
      const response = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
        method: "POST",
        headers: headers("suggestions.placePrediction.placeId,suggestions.placePrediction.text.text"),
        body: JSON.stringify({ input: query, ...(context.countries?.length ? { includedRegionCodes: context.countries.map(country => country.toLowerCase()) } : {}), ...(context.sessionId ? { sessionToken: context.sessionId } : {}) }),
        cache: "no-store",
        signal: addressRequestSignal(context.signal),
      });
      if (!response.ok) throw new Error(`Google Places autocomplete respondió ${response.status}`);
      const payload = await response.json();
      const suggestions = (Array.isArray(payload?.suggestions) ? payload.suggestions : []).flatMap((item: any) => {
        const id = item?.placePrediction?.placeId;
        const label = item?.placePrediction?.text?.text;
        return typeof id === "string" && typeof label === "string" ? [{ id, label }] : [];
      });
      return suggestions.filter((suggestion: AddressSuggestion, index: number) => suggestions.findIndex((candidate: AddressSuggestion) => candidate.id === suggestion.id) === index);
    },
    async resolve(id: string, context: AddressResolveContext = {}) {
      const url = new URL(`https://places.googleapis.com/v1/places/${encodeURIComponent(id)}`);
      if (context.sessionId) url.searchParams.set("sessionToken", context.sessionId);
      const response = await fetch(url, {
        headers: headers("id,formattedAddress,addressComponents,location"), cache: "no-store", signal: addressRequestSignal(context.signal),
      });
      if (!response.ok) throw new Error(`Google Places details respondió ${response.status}`);
      const address = googlePlaceToAddress(await response.json(), context.saveCoordinates !== false);
      if (!address.formatted) throw new Error("El proveedor no devolvió una dirección utilizable");
      return address;
    },
  };
}

