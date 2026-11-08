import assert from "node:assert/strict";
import test from "node:test";
import { ZodError } from "zod";
import {
  WEB_SCHEMA_VERSION, validateWebPage, validateWebTheme, validateWebTemplate,
  validatePublicationManifest, normalizeWebPath, createPublicationManifest,
  serializePublicationManifest, parsePublicationManifest,
} from "../dist/index.js";

const theme = () => ({ colors: { primary: "#123456" }, typography: { body: "Arial" }, spacing: { small: "8px" } });
const page = (path = "/about") => ({
  id: "page-1", path, title: "About", description: "A page",
  puckData: {
    root: { props: { title: "Example" } },
    content: [{ type: "Text", props: { id: "text-1", text: "Hola", visible: true, count: 2, optional: null } }],
    zones: { "text-1:children": [] },
  },
  schemaVersion: WEB_SCHEMA_VERSION,
});
const input = () => ({ publicationId: "pub-1", publishedAt: "2026-11-08T12:30:00.000Z", theme: theme(), pages: [page()] });
const manifest = () => ({ schemaVersion: WEB_SCHEMA_VERSION, ...input() });

test("valid page preserves Puck-compatible JSON", () => {
  assert.deepEqual(validateWebPage(page()), page());
});
test("root page and path are supported", () => {
  assert.equal(validateWebPage(page("/")).path, "/");
  assert.equal(normalizeWebPath(" / "), "/");
});
test("paths are normalized without mutating the input", () => {
  const original = page(" /about//team/ ");
  assert.equal(validateWebPage(original).path, "/about/team");
  assert.equal(original.path, " /about//team/ ");
  assert.equal(normalizeWebPath("/cafe\u0301"), "/café");
});
test("duplicate paths are rejected after normalization", () => {
  for (const paths of [["/about", "/about/"], ["/a/b", "/a//b"], ["/", "/"], ["/café", "/cafe\u0301"]]) {
    assert.throws(() => validatePublicationManifest({ ...manifest(), pages: paths.map(page) }), ZodError);
  }
});
test("unsafe paths are rejected", () => {
  for (const path of ["", "relative", "https://example.com", "//example.com", "/a/../b", "/./b", "/%2e%2e", "/%252e%252e", "/a%2fb", "/a\\b", "/a?b=1", "/a#b", "/a\u0000", "/a\n", "/.git", "/CON", "/a.", "/a:b"]) {
    assert.throws(() => normalizeWebPath(path), { message: /path|segment|character/ });
    assert.throws(() => validateWebPage(page(path)), ZodError);
  }
});
test("internal resource paths are reserved", () => {
  for (const path of ["/_next/chunk.js", "/_NEXT", "/_vercel", "/api/publish", "/assets/logo.png", "/static", "/images", "/fonts", "/favicon.ico", "/robots.txt", "/sitemap.xml", "/index.html", "/404.html", "/_not-found"]) {
    assert.throws(() => normalizeWebPath(path), /Reserved/);
  }
});
test("theme and template validation", () => {
  assert.deepEqual(validateWebTheme(theme()), theme());
  const template = { id: "template-1", name: "Landing", page: page() };
  assert.deepEqual(validateWebTemplate(template), template);
  assert.throws(() => validateWebTheme({ ...theme(), colors: { primary: 12 } }), ZodError);
  assert.throws(() => validateWebTemplate({ ...template, page: page("/../") }), ZodError);
});
test("valid manifest and deterministic creation", () => {
  assert.deepEqual(validatePublicationManifest(manifest()), manifest());
  const data = input();
  const before = structuredClone(data);
  assert.deepEqual(createPublicationManifest(data), manifest());
  assert.deepEqual(createPublicationManifest(data), createPublicationManifest(data));
  assert.deepEqual(data, before);
});
test("invalid and unsupported schema versions are rejected", () => {
  for (const schemaVersion of [0, -1, 2, 1.5, "1", null, undefined]) {
    assert.throws(() => validateWebPage({ ...page(), schemaVersion }), ZodError);
    assert.throws(() => validatePublicationManifest({ ...manifest(), schemaVersion }), ZodError);
  }
  assert.throws(() => createPublicationManifest({ ...input(), schemaVersion: null }), ZodError);
});
test("ISO dates require valid calendar dates and an explicit timezone", () => {
  for (const publishedAt of ["yesterday", "2026-11-08", "2026-11-08T12:30:00", "2026-02-30T12:30:00Z", "2026-13-01T12:30:00Z", "2026-11-08T12:30:00+99:99"]) {
    assert.throws(() => validatePublicationManifest({ ...manifest(), publishedAt }), ZodError);
  }
  assert.equal(validatePublicationManifest({ ...manifest(), publishedAt: "2026-11-08T13:30:00+01:00" }).publishedAt, "2026-11-08T13:30:00+01:00");
});
test("missing fields, unknown fields and invalid manifests are rejected", () => {
  for (const value of [null, {}, { ...manifest(), pages: {} }, { ...manifest(), publicationId: " " }, { ...manifest(), extra: true }]) {
    assert.throws(() => validatePublicationManifest(value), ZodError);
  }
  assert.throws(() => validateWebPage({ ...page(), puckData: [] }), ZodError);
});
test("non-JSON values are rejected at any level", () => {
  for (const value of [undefined, () => {}, Symbol("x"), 1n, NaN, Infinity, -Infinity, -0, new Date(), new Map(), new Set(), /abc/]) {
    assert.throws(() => validateWebPage({ ...page(), puckData: { nested: [value] } }), ZodError);
  }
  assert.throws(() => validateWebPage({ ...page(), description: undefined }), ZodError);
});
test("cycles, sparse arrays, extra array properties and special objects are rejected", () => {
  const cyclic = {}; cyclic.self = cyclic;
  const extra = []; extra.custom = true;
  const symbol = { [Symbol("hidden")]: 1 };
  const hidden = Object.defineProperty({}, "hidden", { value: 1 });
  for (const value of [cyclic, new Array(2), extra, symbol, hidden, new (class Example { value = 1; })(), JSON.parse('{"__proto__":{}}')]) {
    assert.throws(() => validateWebPage({ ...page(), puckData: { value } }), ZodError);
  }
});
test("accessors and toJSON are rejected without being invoked", () => {
  let calls = 0;
  const getter = Object.defineProperty({}, "value", { enumerable: true, get() { calls++; return 1; } });
  const custom = { toJSON() { calls++; return {}; } };
  for (const value of [getter, custom]) assert.throws(() => validateWebPage({ ...page(), puckData: value }), ZodError);
  assert.equal(calls, 0);
});
test("shared references are valid and excessive nesting is rejected", () => {
  const shared = { value: "text" };
  assert.doesNotThrow(() => validateWebPage({ ...page(), puckData: { a: shared, b: shared } }));
  let nested = {};
  for (let index = 0; index < 110; index++) nested = { nested };
  assert.throws(() => validateWebPage({ ...page(), puckData: nested }), ZodError);
});
test("serialization and recovery preserve all data", () => {
  const original = manifest();
  const before = structuredClone(original);
  const encoded = serializePublicationManifest(original);
  assert.deepEqual(parsePublicationManifest(encoded), original);
  assert.deepEqual(JSON.parse(encoded), original);
  assert.deepEqual(original, before);
});
test("serialization and recovery validate their inputs", () => {
  assert.throws(() => serializePublicationManifest({ ...manifest(), pages: [page(), page()] }), ZodError);
  assert.throws(() => parsePublicationManifest('{"schemaVersion":99}'), ZodError);
  assert.throws(() => parsePublicationManifest("not JSON"), SyntaxError);
});
