import assert from "node:assert/strict";
import test from "node:test";
import { createSourceLoader } from "./helpers/dashboard-fixtures.mjs";
import { validateWebPage } from "../packages/web-schema/dist/index.js";

const base = "apps/web/app/(main)/system/web-editor/";
const fixture = createSourceLoader()(base + "fixture.ts");

test("editor fixture is independent and compatible with WebPage.puckData", () => {
  const first = fixture.createEditorExample();
  const second = fixture.createEditorExample();
  first.root.props.title = "Changed";
  assert.notEqual(first.root.props.title, second.root.props.title);
  const exported = JSON.parse(fixture.serializeEditorPage(second));
  assert.deepEqual(exported, second);
  assert.doesNotThrow(() => validateWebPage({ id: "example", path: "/", title: "Example", schemaVersion: 1, puckData: exported }));
});
test("export rejects unknown components and invalid nested slots", () => {
  const data = fixture.createEditorExample();
  data.content[1].props.content[0].type = "Unknown";
  assert.throws(() => fixture.serializeEditorPage(data));
  const bad = fixture.createEditorExample();
  bad.content[1].props.content[2].props.first = {};
  assert.throws(() => fixture.serializeEditorPage(bad));
});
test("optional props may be absent without changing shared validators", () => {
  const data = fixture.createEditorExample();
  delete data.content[0].props.align;
  assert.doesNotThrow(() => fixture.serializeEditorPage(data));
  data.content[0].props.image = { src: "/image.png" };
  assert.throws(() => fixture.serializeEditorPage(data));
});
test("Puck optional undefined values export as absent properties", () => {
  const data = fixture.createEditorExample();
  data.content[0].readOnly = undefined;
  data.content[0].props.image = undefined;
  const exported = JSON.parse(fixture.serializeEditorPage(data));
  assert.equal(Object.hasOwn(exported.content[0], "readOnly"), false);
  assert.equal(Object.hasOwn(exported.content[0].props, "image"), false);
  data.content[0].props.title = undefined;
  assert.throws(() => fixture.serializeEditorPage(data));
});
test("editor normalization never accepts unsafe values", () => {
  for (const value of [() => {}, NaN, Infinity, 1n, new Date(), new Array(2), [undefined]]) {
    const data = fixture.createEditorExample();
    data.content[0].props.image = value;
    assert.throws(() => fixture.serializeEditorPage(data));
  }
  const data = fixture.createEditorExample();
  data.content[0].props.image = data;
  assert.throws(() => fixture.serializeEditorPage(data));
});
for (const [name, context, expected] of [
  ["no session", null, "/login"],
  ["ordinary user", { role: { slug: "user" } }, "/403"],
  ["missing authoritative role", { role: null, profile: { role: "systemadmin" } }, "/403"],
  ["user-editable metadata cannot grant access", { role: { slug: "user" }, user: { user_metadata: { role: "systemadmin" } } }, "/403"],
]) {
  test(`server authorization rejects ${name} before loading editor resources`, async () => {
    let reads = 0;
    const load = createSourceLoader({
      "@/actions/webPages": { getWebPageDraft: async () => null },
      "@/lib/auth/getCurrentUser": { getCurrentUser: async () => context },
      "next/navigation": { redirect: (url) => { throw new Error(`redirect:${url}`); } },
      "node:fs/promises": { readFile: async () => { reads++; return ""; } },
      "./WebEditorLoader": { __esModule: true, default: () => null },
    });
    await assert.rejects(load(base + "page.tsx").default(), { message: `redirect:${expected}` });
    assert.equal(reads, 0);
  });
}
test("systemadmin receives editor with isolated shared preview styles", async () => {
  const load = createSourceLoader({
      "@/actions/webPages": { getWebPageDraft: async () => null },
    "@/lib/auth/getCurrentUser": { getCurrentUser: async () => ({ role: { slug: "systemadmin" } }) },
    "next/navigation": { redirect: () => { throw new Error("Unexpected redirect"); } },
    "node:fs/promises": { readFile: async () => '.jws-test { color: green; }' },
    "./WebEditorLoader": { __esModule: true, default: () => null },
  });
  const element = await load(base + "page.tsx").default();
  assert.match(element.props.previewCss, /jws-test/);
});
