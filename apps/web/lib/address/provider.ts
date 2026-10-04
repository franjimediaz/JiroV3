import type { AddressValue } from "@repo/types";

export type AddressProviderName = "google" | "geoapify";
export type AddressAttribution = { label: string; url: string };
export type AddressSuggestion = { id: string; label: string; secondaryLabel?: string; attribution?: AddressAttribution[] };
export type AddressSearchContext = { countries?: string[]; sessionId?: string; signal?: AbortSignal };
export type AddressResolveContext = { saveCoordinates?: boolean; sessionId?: string; signal?: AbortSignal };

export interface ServerAddressProvider {
  readonly name: AddressProviderName;
  search(query: string, context?: AddressSearchContext): Promise<AddressSuggestion[]>;
  resolve(id: string, context?: AddressResolveContext): Promise<AddressValue>;
}

export function addressRequestSignal(signal?: AbortSignal, timeoutMs = 8_000) {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

