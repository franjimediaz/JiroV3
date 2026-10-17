import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(resolve("apps/web/package.json"));
function loader(overrides = {}) {
  const cache = new Map();
  return function load(file) {
    const path = resolve(file);
    if (cache.has(path)) return cache.get(path).exports;
    const module = { exports: {} }; cache.set(path, module);
    const code = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    new Function("require", "module", "exports", "process", code)(id => {
      if (id in overrides) return overrides[id];
      if (id === "@repo/types") return {};
      if (id.startsWith(".") || id.startsWith("@/")) {
        const base = id.startsWith("@/") ? resolve("apps/web", id.slice(2)) : resolve(dirname(path), id);
        for (const suffix of [".ts", ".tsx"]) if (existsSync(base + suffix)) return load(base + suffix);
      }
      return require(id);
    }, module, module.exports, process);
    return module.exports;
  };
}

test("Geoapify uses autocomplete country filters and normalizes place details", async () => {
  const originalFetch = globalThis.fetch;
  const urls = [];
  globalThis.fetch = async url => {
    urls.push(String(url));
    if (String(url).includes("autocomplete")) return Response.json({ results: [{ place_id: "geo-1", formatted: "Calle Mayor 10, Madrid, España", address_line1: "Calle Mayor 10", address_line2: "Madrid, España" }] });
    return Response.json({ features: [{ properties: { place_id: "geo-1", formatted: "Calle Mayor 10, Madrid, España", street: "Calle Mayor", housenumber: "10", postcode: "28013", city: "Madrid", state: "Madrid", country: "España", country_code: "es", lat: 40.416, lon: -3.704 } }] });
  };
  try {
    const { createGeoapifyProvider } = loader()("apps/web/lib/address/geoapifyProvider.ts");
    const provider = createGeoapifyProvider("test-key");
    const suggestions = await provider.search("Calle Mayor", { countries: ["ES"] });
    assert.equal(suggestions[0].id, "geo-1");
    assert.equal(suggestions[0].label, "Calle Mayor 10");
    assert.deepEqual(suggestions[0].attribution.map(item => item.label), ["Powered by Geoapify", "© OpenStreetMap contributors"]);
    const autocomplete = new URL(urls[0]);
    assert.equal(autocomplete.origin + autocomplete.pathname, "https://api.geoapify.com/v1/geocode/autocomplete");
    assert.equal(autocomplete.searchParams.get("filter"), "countrycode:es");
    assert.equal(autocomplete.searchParams.get("limit"), "7");
    assert.deepEqual(await provider.resolve("geo-1", { saveCoordinates: false }), { formatted: "Calle Mayor 10, Madrid, España", provider: "geoapify", providerId: "geo-1" });
    assert.equal(urls.length, 1, "autocomplete already supplies the address; resolve must not fetch again");
    assert.deepEqual(await provider.resolve("uncached", { saveCoordinates: false }), { formatted: "Calle Mayor 10, Madrid, España", street: "Calle Mayor", number: "10", postalCode: "28013", city: "Madrid", province: "Madrid", country: "España", countryCode: "ES", provider: "geoapify", providerId: "geo-1" });
    assert.equal(new URL(urls[1]).pathname, "/v2/place-details");
  } finally { globalThis.fetch = originalFetch; }
});

test("provider selection is environment-only and validates the selected key", () => {
  class FakeApiError extends Error { constructor(_code, status, message) { super(message); this.status = status; } }
  const factory = loader({ "@/lib/auth/apiError": { ApiError: FakeApiError } })("apps/web/lib/address/getAddressProvider.ts");
  const previous = [process.env.ADDRESS_PROVIDER, process.env.GOOGLE_PLACES_API_KEY, process.env.GEOAPIFY_API_KEY];
  try {
    process.env.ADDRESS_PROVIDER = "google"; process.env.GOOGLE_PLACES_API_KEY = "google-key"; delete process.env.GEOAPIFY_API_KEY;
    assert.equal(factory.getAddressProvider().name, "google");
    assert.throws(() => factory.configuredAddressProviderName("unknown"), /ADDRESS_PROVIDER/);
    process.env.ADDRESS_PROVIDER = "geoapify"; process.env.GEOAPIFY_API_KEY = "geo-key"; delete process.env.GOOGLE_PLACES_API_KEY;
    assert.equal(factory.getAddressProvider().name, "geoapify");
    delete process.env.GEOAPIFY_API_KEY;
    assert.throws(() => factory.getAddressProvider(), /GEOAPIFY_API_KEY/);
    delete process.env.ADDRESS_PROVIDER; process.env.GOOGLE_PLACES_API_KEY = "google-key";
    assert.equal(factory.getAddressProvider().name, "google");
  } finally {
    [["ADDRESS_PROVIDER", previous[0]], ["GOOGLE_PLACES_API_KEY", previous[1]], ["GEOAPIFY_API_KEY", previous[2]]].forEach(([key, value]) => value === undefined ? delete process.env[key] : process.env[key] = value);
  }
});

test("manual values identify their source and the frontend remains provider-neutral", () => {
  const input = readFileSync(resolve("packages/ui/src/components/fields/AddressInput.tsx"), "utf8");
  assert.match(input, /provider: "manual"/);
  assert.doesNotMatch(input, /google|geoapify/i);
  const unexpectedCall = () => { throw new Error("Manual entry must not call a provider"); };
  const { manualAddressValue } = loader({ "./addressProvider": { defaultAddressProvider: { search: unexpectedCall, resolve: unexpectedCall } } })("packages/ui/src/components/fields/AddressInput.tsx");
  assert.deepEqual(manualAddressValue("  Nave 12  "), { formatted: "Nave 12", provider: "manual" });
  assert.equal(manualAddressValue("   "), null);
});

test("Geoapify reuses normalized autocomplete across provider instances without losing coordinates", async () => {
  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;
  let now = originalNow();
  Date.now = () => now;
  const urls = [];
  const properties = { place_id: "address", formatted: "Mayor 10", street: "Mayor", housenumber: "10", postcode: "28013", city: "Madrid", county: "Madrid", state: "Comunidad de Madrid", country: "España", country_code: "es", lat: 40.416, lon: -3.704 };
  globalThis.fetch = async url => {
    urls.push(new URL(url));
    return String(url).includes("autocomplete")
      ? Response.json({ results: [{ place_id: "city", formatted: "Madrid" }, properties, properties, { place_id: "country", formatted: "España", result_type: "country" }] })
      : Response.json({ features: [{ properties }] });
  };
  try {
    const { createGeoapifyProvider } = loader()("apps/web/lib/address/geoapifyProvider.ts");
    const suggestions = await createGeoapifyProvider("key").search("Mayor", { countries: ["ES", "PT"], sessionId: "ignored" });
    assert.deepEqual(suggestions.map(item => item.id), ["address", "city"]);
    assert.equal(urls[0].searchParams.get("filter"), "countrycode:es,pt");
    assert.equal(urls[0].searchParams.has("sessionId"), false);
    assert.equal(urls[0].searchParams.has("sessionToken"), false);
    assert.equal("street" in suggestions[0], false);
    const provider = createGeoapifyProvider("key");
    const address = await provider.resolve("address", { saveCoordinates: false });
    assert.deepEqual(address, { formatted: "Mayor 10", street: "Mayor", number: "10", postalCode: "28013", city: "Madrid", province: "Madrid", country: "España", countryCode: "ES", provider: "geoapify", providerId: "address" });
    assert.equal((await provider.resolve("address")).lat, 40.416);
    assert.equal((await provider.resolve("address")).lng, -3.704);
    assert.equal(urls.length, 1);
    now += 300_001;
    await provider.resolve("address");
    assert.equal(urls.length, 2, "expired entries use Place Details");
    const controller = new AbortController(); controller.abort();
    await assert.rejects(provider.resolve("address", { signal: controller.signal }), { name: "AbortError" });
  } finally { globalThis.fetch = originalFetch; Date.now = originalNow; }
});

test("Google preserves sessions, field masks, country filters and coordinate opt-out", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return String(url).includes("autocomplete")
      ? Response.json({ suggestions: [{ placePrediction: { placeId: "place", text: { text: "Madrid" } } }] })
      : Response.json({ id: "place", formattedAddress: "Madrid", location: { latitude: 40, longitude: -3 } });
  };
  try {
    const provider = loader()("apps/web/lib/address/googlePlacesProvider.ts").createGooglePlacesProvider("key");
    await provider.search("Madrid", { countries: ["ES"], sessionId: "session" });
    assert.deepEqual(JSON.parse(calls[0].options.body), { input: "Madrid", includedRegionCodes: ["es"], sessionToken: "session" });
    assert.equal(calls[0].options.headers["X-Goog-FieldMask"], "suggestions.placePrediction.placeId,suggestions.placePrediction.text.text");
    const address = await provider.resolve("place", { sessionId: "session", saveCoordinates: false });
    assert.equal(new URL(calls[1].url).searchParams.get("sessionToken"), "session");
    assert.equal(calls[1].options.headers["X-Goog-FieldMask"], "id,formattedAddress,addressComponents,location");
    assert.equal("lat" in address, false);
  } finally { globalThis.fetch = originalFetch; }
});
