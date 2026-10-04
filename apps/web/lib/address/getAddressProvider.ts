import { ApiError } from "@/lib/auth/apiError";
import { createGeoapifyProvider } from "./geoapifyProvider";
import { createGooglePlacesProvider } from "./googlePlacesProvider";
import type { AddressProviderName, ServerAddressProvider } from "./provider";

export function configuredAddressProviderName(value = process.env.ADDRESS_PROVIDER): AddressProviderName {
  const normalized = (value || "google").trim().toLowerCase();
  if (normalized === "google" || normalized === "geoapify") return normalized;
  throw new ApiError("INTERNAL", 503, `ADDRESS_PROVIDER no válido: ${normalized}`);
}

export function getAddressProvider(): ServerAddressProvider {
  const name = configuredAddressProviderName();
  if (name === "geoapify") {
    if (!process.env.GEOAPIFY_API_KEY) throw new ApiError("INTERNAL", 503, "GEOAPIFY_API_KEY no está configurada");
    return createGeoapifyProvider(process.env.GEOAPIFY_API_KEY);
  }
  if (!process.env.GOOGLE_PLACES_API_KEY) throw new ApiError("INTERNAL", 503, "GOOGLE_PLACES_API_KEY no está configurada");
  return createGooglePlacesProvider(process.env.GOOGLE_PLACES_API_KEY);
}

