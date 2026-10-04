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
    const code = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
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
    assert.deepEqual(await provider.resolve("geo-1", { saveCoordinates: false }), { formatted: "Calle Mayor 10, Madrid, España", street: "Calle Mayor", number: "10", postalCode: "28013", city: "Madrid", province: "Madrid", country: "España", countryCode: "ES", provider: "geoapify", providerId: "geo-1" });
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
});
