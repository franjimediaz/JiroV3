import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { parsePublicationManifest } from "@repo/web-schema";
import { validateWebPuckData, webPuckConfig } from "../dist/index.js";

const node = (type, id, props = {}) => ({ type, props: { id, ...props } });
const heading = (id = "heading") => node("Heading", id, { text: "Hello", level: 2 });
const data = (content = [heading()]) => ({ root: { props: { title: "Test" } }, content });

test("both demo pages conform to the manifest and real Puck data types", () => {
  const manifest = parsePublicationManifest(readFileSync(new URL("../../../apps/web-static/content/publication.json", import.meta.url), "utf8"));
  assert.deepEqual(manifest.pages.map(page => page.path), ["/", "/contacto"]);
  for (const page of manifest.pages) assert.deepEqual(validateWebPuckData(page.puckData), page.puckData);
});
test("all nine registered components have valid defaults", () => {
  assert.equal(Object.keys(webPuckConfig.components).length, 9);
  for (const [type, config] of Object.entries(webPuckConfig.components)) {
    assert.ok(config.label);
    assert.ok(config.fields);
    assert.doesNotThrow(() => validateWebPuckData(data([node(type, type, config.defaultProps)])));
  }
});
test("unknown top-level components fail before rendering", () => {
  assert.throws(() => validateWebPuckData(data([node("Unknown", "unknown")])));
});
test("unknown types fail in arbitrarily nested slots", () => {
  const bad = node("Unknown", "bad");
  const section = node("Section", "section", { content: [bad] });
  const container = node("Container", "container", { content: [section] });
  assert.throws(() => validateWebPuckData(data([container])));
  for (const slot of ["first", "second", "third"]) {
    assert.throws(() => validateWebPuckData(data([node("Columns", "columns", { columns: 3, first: [], second: [], third: [], [slot]: [bad] })])));
  }
});
test("incomplete data and incompatible props are rejected", () => {
  for (const value of [{}, { content: [] }, { root: {}, content: [] }, { root: { props: {} } }, data([{ type: "Heading", props: { text: "No id" } }]), data([node("Heading", "missing-text")]), data([node("Heading", "bad-level", { text: "Bad", level: 9 })]), data([node("Section", "missing-slot")]), data([node("Section", "bad-slot", { content: {} })]), data([node("Heading", "unknown-prop", { text: "Title", html: "<b>no</b>" })])]) {
    assert.throws(() => validateWebPuckData(value));
  }
});
test("non-serializable data and cycles are rejected", () => {
  const cycle = data(); cycle.self = cycle;
  for (const value of [cycle, data([node("TextBlock", "function", { text: () => "no" })]), data([node("ImageBlock", "infinite", { src: "/image.svg", alt: "", width: Infinity })])]) {
    assert.throws(() => validateWebPuckData(value));
  }
});
test("duplicate ids are rejected across nested slots", () => {
  assert.throws(() => validateWebPuckData(data([heading(), node("Section", "section", { content: [heading()] })])));
});
test("legacy zones cannot silently hide content", () => {
  assert.doesNotThrow(() => validateWebPuckData({ ...data(), zones: {} }));
  assert.throws(() => validateWebPuckData({ ...data(), zones: { unused: [heading()] } }));
});
test("two and three column slots validate and hidden content fails", () => {
  for (const columns of [2, 3]) {
    assert.doesNotThrow(() => validateWebPuckData(data([node("Columns", "columns", { columns, first: [heading("first")], second: [heading("second")], third: columns === 3 ? [heading("third")] : [] })])));
  }
  assert.throws(() => validateWebPuckData(data([node("Columns", "columns", { columns: 2, first: [], second: [], third: [heading()] })])));
});
test("unsafe links and incompatible optional Hero props fail", () => {
  assert.throws(() => validateWebPuckData(data([node("ButtonLink", "bad", { text: "Bad", href: "javascript:alert(1)" })])));
  assert.throws(() => validateWebPuckData(data([node("Hero", "hero", { title: "Hero", subtitle: "Text", image: { src: "/image.svg" } })])));
});
test("validation does not mutate valid content", () => {
  const input = data([node("Container", "container", { content: [heading()] })]);
  const before = structuredClone(input);
  assert.deepEqual(validateWebPuckData(input), before);
  assert.deepEqual(input, before);
});
