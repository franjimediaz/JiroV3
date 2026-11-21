import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { parsePublicationManifest } from "@repo/web-schema";
import { validateWebPuckData, webPuckConfig } from "../dist/index.js";
import { Container } from "@repo/web-components";

const node = (type, id, props = {}) => ({ type, props: { id, ...props } });
const heading = (id = "heading") => node("Heading", id, { text: "Hello", level: 2 });
const data = (content = [heading()]) => ({ root: { props: { title: "Test" } }, content });

test("both demo pages conform to the manifest and real Puck data types", () => {
  const manifest = parsePublicationManifest(readFileSync(new URL("../../../apps/web-static/content/publication.json", import.meta.url), "utf8"));
  assert.deepEqual(manifest.pages.map(page => page.path), ["/", "/services"]);
  for (const page of manifest.pages) assert.deepEqual(validateWebPuckData(page.puckData), page.puckData);
});
test("all ten registered components have valid defaults", () => {
  assert.equal(Object.keys(webPuckConfig.components).length, 10);
  for (const [type, config] of Object.entries(webPuckConfig.components)) {
    assert.ok(config.label);
    assert.ok(config.fields);
    assert.doesNotThrow(() => validateWebPuckData(data([node(type, type, config.defaultProps)])));
  }
});
test("safe visual styles and responsive header validate", () => {
  assert.doesNotThrow(() => validateWebPuckData(data([
    node("Heading", "styled", { text: "Styled", style: { color: "#112233", fontSize: 42, fontWeight: 700, textAlign: "center" } }),
    node("Header", "header", { brandText: "Jiro", homeHref: "/", links: [{ label: "Servicios", href: "/services" }], sticky: true }),
  ])));
  assert.throws(() => validateWebPuckData(data([node("TextBlock", "unsafe-style", { text: "No", style: { css: "position:fixed" } })])));
  assert.throws(() => validateWebPuckData(data([node("Header", "unsafe-header", { links: [{ label: "No", href: "javascript:alert(1)" }] })])));
});
test("TextBlock exposes the visual inspector and forwards its style", () => {
  const config = webPuckConfig.components.TextBlock;
  assert.equal(config.fields.style.type, "object");
  assert.equal(config.fields.style.label, "Diseño visual");
  const rendered = config.render({ id: "text", text: "Styled", align: "left", style: { color: "#123456", fontSize: 22 } });
  assert.deepEqual(rendered.props.style, { color: "#123456", fontSize: 22 });
});
test("Heading forwards one style value with typography, color and alignment", () => {
  const config = webPuckConfig.components.Heading;
  const style = { color: "#334455", fontSize: 36, fontWeight: 700, textAlign: "right" };
  const rendered = config.render({ id: "heading", text: "Title", level: 2, align: "left", style });
  assert.deepEqual(rendered.props.style, style);
  const headingElement = rendered.type(rendered.props);
  assert.equal(headingElement.props.style.color, "#334455");
  assert.equal(headingElement.props.style.fontSize, 36);
  assert.equal(headingElement.props.style.fontWeight, 700);
  assert.equal(headingElement.props.style.textAlign, "right");
});
test("Container visual values override legacy values without changing legacy-only output", () => {
  const legacy = Container({ children: "Content", backgroundColor: "#111111", padding: 12, borderRadius: 4,
    display: "flex", gap: 8, justifyContent: "between", alignItems: "center" });
  assert.equal(legacy.props.style.backgroundColor, "#111111");
  assert.equal(legacy.props.style.padding, 12);
  assert.equal(legacy.props.style.justifyContent, "space-between");
  assert.equal(legacy.props.style.alignItems, "center");
  const modern = Container({ children: "Content", backgroundColor: "#111111", padding: 12, borderRadius: 4,
    display: "flex", gap: 8, justifyContent: "between", alignItems: "center",
    style: { backgroundColor: "#abcdef", padding: 24, borderRadius: 18, display: "block", gap: 20,
      justifyContent: "end", alignItems: "stretch" } });
  assert.equal(modern.props.style.backgroundColor, "#abcdef");
  assert.equal(modern.props.style.padding, 24);
  assert.equal(modern.props.style.borderRadius, 18);
  assert.equal(modern.props.style.display, "block");
  assert.equal(modern.props.style.gap, 20);
  assert.equal(modern.props.style.justifyContent, "flex-end");
  assert.equal(modern.props.style.alignItems, "stretch");
});
test("legacy JSON remains valid while static Puck data accepts visual styles", () => {
  const legacy = data([node("Container", "legacy", { backgroundColor: "#ffffff", padding: 16, display: "flex",
    gap: 12, justifyContent: "center", alignItems: "stretch", content: [node("TextBlock", "old-text", { text: "Old" })] })]);
  assert.deepEqual(validateWebPuckData(legacy), legacy);
  const styled = data([node("TextBlock", "new-text", { text: "New", style: { color: "#123456", fontSize: 20 } })]);
  assert.deepEqual(validateWebPuckData(styled), styled);
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
