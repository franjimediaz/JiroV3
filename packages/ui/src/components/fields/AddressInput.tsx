"use client";

import type { AddressValue, Field } from "@repo/types";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { defaultAddressProvider, type AddressProvider, type AddressSuggestion } from "./addressProvider";

export function addressLabel(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && typeof (value as AddressValue).formatted === "string") return (value as AddressValue).formatted;
  return "";
}

export function manualAddressValue(value: string): AddressValue | null {
  const formatted = value.trim();
  return formatted ? { formatted, provider: "manual" } : null;
}

export function sanitizeAddressCoordinates(value: AddressValue, saveCoordinates: boolean): AddressValue {
  if (saveCoordinates) return value;
  const { lat: _lat, lng: _lng, ...withoutCoordinates } = value;
  return withoutCoordinates;
}

function isAbortError(cause: unknown) {
  return cause instanceof Error && cause.name === "AbortError";
}

export default function AddressInput({ field, value, onChange, readOnly, provider = defaultAddressProvider }: {
  field: Field;
  value: AddressValue | string | null;
  onChange: (value: AddressValue | null) => void;
  readOnly?: boolean;
  provider?: AddressProvider;
}) {
  const options = field.address;
  const countries = useMemo(() => options?.countries?.length ? options.countries : ["ES"], [options?.countries]);
  const saveCoordinates = options?.saveCoordinates !== false;
  const allowManual = options?.allowManual !== false;
  const [query, setQuery] = useState(() => addressLabel(value));
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const requestSequence = useRef(0);
  const resolveController = useRef<AbortController | null>(null);
  const sessionId = useRef(crypto.randomUUID());
  const attributions = suggestions[0]?.attribution || [];

  useEffect(() => setQuery(addressLabel(value)), [value]);
  useEffect(() => () => resolveController.current?.abort(), []);
  useEffect(() => {
    if (readOnly || query.trim().length < 3 || query === addressLabel(value)) { setSuggestions([]); return; }
    const sequence = ++requestSequence.current;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true); setError("");
      try {
        const results = await provider.search(query.trim(), { countries, sessionId: sessionId.current, signal: controller.signal });
        if (requestSequence.current === sequence) setSuggestions(results);
      } catch (cause) {
        if (requestSequence.current === sequence && !isAbortError(cause)) { setSuggestions([]); setError(cause instanceof Error ? cause.message : "No se pudo buscar la dirección"); }
      } finally { if (requestSequence.current === sequence) setLoading(false); }
    }, 350);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [countries, provider, query, readOnly, value]);

  if (readOnly) return <div className="form-control-plaintext">{addressLabel(value) || "—"}</div>;

  async function selectSuggestion(suggestion: AddressSuggestion) {
    resolveController.current?.abort();
    const controller = new AbortController();
    resolveController.current = controller;
    setLoading(true); setError("");
    try {
      const resolved = sanitizeAddressCoordinates(await provider.resolve(suggestion.id, { saveCoordinates, sessionId: sessionId.current, signal: controller.signal }), saveCoordinates);
      onChange(resolved); setQuery(resolved.formatted); setSuggestions([]);
      sessionId.current = crypto.randomUUID();
    } catch (cause) { if (!isAbortError(cause)) setError(cause instanceof Error ? cause.message : "No se pudo resolver la dirección"); }
    finally { if (resolveController.current === controller) { resolveController.current = null; setLoading(false); } }
  }

  return <div className="position-relative">
    <div className="input-group">
      <input className="form-control" value={query} placeholder={field.placeholder || "Buscar dirección"}
        autoComplete="street-address" onChange={(event) => { setQuery(event.target.value); if (!event.target.value) onChange(null); }} />
      {allowManual && query.trim() && query !== addressLabel(value) ? <button type="button" className="btn btn-outline-secondary" onClick={() => { onChange(manualAddressValue(query)); setSuggestions([]); }}>Usar texto</button> : null}
    </div>
    {loading ? <div className="small text-muted mt-1">Buscando…</div> : null}
    {error ? <div className="small text-danger mt-1">{error}</div> : null}
    {suggestions.length ? <div className="list-group position-absolute w-100 shadow-sm" style={{ zIndex: 1050 }} role="listbox">
      {suggestions.map(suggestion => <button key={suggestion.id} type="button" className="list-group-item list-group-item-action" onClick={() => void selectSuggestion(suggestion)}><span className="d-block">{suggestion.label}</span>{suggestion.secondaryLabel ? <span className="d-block small text-muted">{suggestion.secondaryLabel}</span> : null}</button>)}
      {attributions.length ? <div className="list-group-item small text-muted d-flex gap-2 flex-wrap">{attributions.map(item => <a key={item.url} href={item.url} target="_blank" rel="noreferrer">{item.label}</a>)}</div> : null}
    </div> : null}
  </div>;
}

