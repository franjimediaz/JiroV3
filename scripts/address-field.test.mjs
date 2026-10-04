import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(resolve("apps/web/package.json"));
function load(file) {
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(resolve(file), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function("require", "module", "exports", "process", code)(id => id === "@repo/types" ? {} : id === "./provider" ? { addressRequestSignal: signal => signal } : require(id), module, module.exports, process);
  return module.exports;
}

test("Google Places result is normalized as a structured address", () => {
  const { googlePlaceToAddress } = load("apps/web/lib/address/googlePlacesProvider.ts");
  const value = googlePlaceToAddress({ id: "place-1", formattedAddress: "Calle de Alcalá, 120, Madrid, España", location: { latitude: 40.4212, longitude: -3.6754 }, addressComponents: [
    { longText: "Calle de Alcalá", types: ["route"] }, { longText: "120", types: ["street_number"] },
    { longText: "28009", types: ["postal_code"] }, { longText: "Madrid", types: ["locality"] },
    { longText: "Madrid", types: ["administrative_area_level_1"] }, { longText: "España", shortText: "ES", types: ["country"] },
  ] }, true);
  assert.deepEqual(value, { formatted: "Calle de Alcalá, 120, Madrid, España", street: "Calle de Alcalá", number: "120", postalCode: "28009", city: "Madrid", province: "Madrid", country: "España", countryCode: "ES", lat: 40.4212, lng: -3.6754, provider: "google", providerId: "place-1" });
  const withoutCoordinates = googlePlaceToAddress({ id: "place-1", formattedAddress: value.formatted, location: { latitude: 1, longitude: 2 } }, false);
  assert.equal("lat" in withoutCoordinates, false); assert.equal("lng" in withoutCoordinates, false);
});

test("address persistence keeps objects and nulls without stringifying", () => {
  const address = { formatted: "Madrid, España", city: "Madrid", countryCode: "ES" };
  for (const value of [address, null]) {
    const encoded = JSON.parse(JSON.stringify({ data: { address: value } }));
    assert.deepEqual(encoded.data.address, value);
    assert.notEqual(encoded.data.address, "[object Object]");
  }
});

test("field integration declares address as native, nullable, and rendered independently", () => {
  const fields = readFileSync(resolve("packages/types/fields.ts"), "utf8");
  const form = readFileSync(resolve("packages/ui/src/Form.tsx"), "utf8");
  const input = readFileSync(resolve("packages/ui/src/components/fields/FieldInput.tsx"), "utf8");
  const addressInput = readFileSync(resolve("packages/ui/src/components/fields/AddressInput.tsx"), "utf8");
  assert.match(fields, /\| "address"/); assert.match(fields, /"address",/);
  assert.match(form, /case "address":\s*\r?\n\s*return null/);
  assert.match(input, /type === "address"[\s\S]*<AddressInput/);
  assert.match(addressInput, /query\.trim\(\)\.length < 3/);
  assert.match(addressInput, /}, 350\)/);
  assert.match(addressInput, /new AbortController\(\)/);
});

test("address provider forwards abort signals and removes duplicate suggestions", async () => {
  const originalFetch = globalThis.fetch;
  const controller = new AbortController();
  let receivedSignal;
  globalThis.fetch = async (_url, options) => {
    receivedSignal = options.signal;
    return Response.json({ suggestions: [{ id: "same", label: "Madrid" }, { id: "same", label: "Madrid duplicado" }, { id: "other", label: "Madrid, España" }] });
  };
  try {
    const { defaultAddressProvider } = load("packages/ui/src/components/fields/addressProvider.ts");
    const suggestions = await defaultAddressProvider.search("Madrid", { countries: ["ES"], signal: controller.signal });
    assert.equal(receivedSignal, controller.signal);
    assert.deepEqual(suggestions.map(item => item.id), ["same", "other"]);
  } finally { globalThis.fetch = originalFetch; }
});
