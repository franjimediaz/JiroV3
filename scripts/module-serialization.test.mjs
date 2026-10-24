import assert from "node:assert/strict";
import test from "node:test";
import { createSourceLoader } from "./helpers/dashboard-fixtures.mjs";

const load = createSourceLoader();
const { serializeModuleSchema: serialize, serializeFormAction, updateFormActionConfig } = load("packages/types/serializeModuleSchema.ts");
const { normalizeModuleSchema: normalize, getLegacySchemaWarnings } = load("packages/types/normalizeModuleSchema.ts");
const { pickPersistablePayload } = load("packages/types/persistablePayload.ts");
const json = value => JSON.parse(JSON.stringify(value));

test("legacy module becomes canonical, keeps runtime aliases and is stable across saves", () => {
  const raw = {
    table: "physical_tasks", extra: { extension: true },
    fields: [{ name: "id", type: "text", virtual: true }, { name: "name", type: "text", appareance: "Always", defaultValue: "" }],
    ui: { formSections: [{ title: "Main", fields: ["name", { name: "id" }] }],
      specialViews: [{ id: "plan", type: "planEditor", label: "Plan", sourceField: "drawing", options: { width: 900 } }],
      calendar: { sourceTable: "tasks", titleField: "name", startField: "date", colorField: "", allDayField: "" },
      treeView: { sourceTable: "tasks", groupBy: ["group"], columns: ["name"] },
    },
  };
  const before = structuredClone(raw);
  const saved = json(serialize(raw));
  assert.deepEqual(raw, before);
  assert.equal(saved.table, undefined);
  assert.equal(saved.db.table, "physical_tasks");
  assert.equal(saved.fields[1].appareance, undefined);
  assert.equal(saved.fields[1].appearance, "Always");
  assert.equal(saved.fields[1].defaultValue, "");
  assert.deepEqual(saved.extra, raw.extra);
  assert.deepEqual(saved.ui.tabs[0].config.formSections[0].fields, ["name", "id"]);
  assert.equal(saved.ui.formSections, undefined);
  assert.equal(saved.ui.calendar, undefined);
  const plan = saved.ui.specialViews[0];
  assert.equal(plan.sourceField, undefined);
  assert.equal(plan.options, undefined);
  assert.equal(plan.config.sourceField, "drawing");
  assert.equal(plan.config.options.width, 900);
  const calendar = saved.ui.tabs.find(tab => tab.type === "calendar");
  assert.equal(calendar.config.colorField, undefined);
  assert.equal(calendar.config.sourceModuleSlug, "tasks");
  assert.equal(normalize(saved).fields[1].appareance, "Always");
  assert.equal(normalize(saved).ui.specialViews[0].sourceField, "drawing");
  assert.deepEqual(json(serialize(normalize(saved))), saved);
});

test("ReverseLinks never enter insert/update, including raw schemas with virtual false", () => {
  const schema = { db: { table: "parents" }, fields: [
    { name: "id", type: "text", virtual: true },
    { name: "children", type: "ReverseLink", virtual: false, ref: { moduleSlug: "child", foreignKey: "parent_id" } },
    { name: "title", type: "text" },
  ] };
  assert.equal(normalize(schema).fields[1].virtual, true);
  assert.equal(serialize(schema).fields[1].virtual, true);
  for (const operation of ["create", "update"]) assert.deepEqual(pickPersistablePayload({ id: "id", children: [], title: "" }, schema, { operation }), { title: "" });
});

test("copyRelated persists only its recursive contract and retains literal defaults", () => {
  const node = { source: { table: "source_physical", match: { field: "group", valueFromRecord: "group_id" }, parentTable: "stale" },
    target: { table: "target_physical", parentField: "owner", parentTable: "stale" },
    map: { name: "title" }, defaults: { text: "", nullable: null, nested: { navigateTo: "" } }, maps: { parent: {} }, kind: "derive",
    dedupe: { enabled: false, sourceIdField: "", targetSourceIdField: "" },
    children: [{ source: { table: "child", parentField: "owner", match: {} }, target: { table: "child_copy", parentField: "owner" }, defaults: { text: "" } }],
  };
  const out = serializeFormAction({ id: "copy", type: "workflow", workflowKey: "records.copyRelated", input: node, hrefTemplate: "old", after: { navigateTo: "" }, disabledWhen: { type: "modeIs", modes: ["create"] } });
  assert.equal(out.hrefTemplate, undefined);
  assert.equal(out.after, undefined);
  assert.equal(out.input.kind, undefined);
  assert.equal(out.input.maps, undefined);
  assert.equal(out.input.source.parentTable, undefined);
  assert.equal(out.input.source.table, "source_physical");
  assert.deepEqual(out.input.defaults, node.defaults);
  assert.deepEqual(out.input.dedupe, { enabled: false });
  assert.equal(out.input.children[0].source.match, undefined);
  assert.ok(out.disabledWhen);
});

test("derive converts legacy child aliases and preserves idempotency and source updates", () => {
  const input = { kind: "derive", source: { parentTable: "parents", parentIdTemplate: "{{id}}", children: { table: "children", fkToParent: "parent_id" } },
    target: { parentTable: "copies", children: { table: "child_copies", fkToParent: "copy_id" } },
    maps: { parent: { name: "title" }, child: { name: "name" } }, defaults: { parent: { name: "" }, child: { blank: "" } },
    sourceUpdates: { parent: { processed: true }, child: { copied: true } }, idempotency: { targetField: "source_id", valueTemplate: "{{id}}" },
  };
  const out = serializeFormAction({ type: "workflow", workflowKey: "derive.createFromParent", input }).input;
  assert.deepEqual(out.source, { parentTable: "parents" });
  assert.deepEqual(out.maps, { parent: input.maps.parent });
  assert.deepEqual(out.children[0].sourceUpdates, { copied: true });
  assert.deepEqual(out.children[0].defaults, { blank: "" });
  assert.deepEqual(out.idempotency, input.idempotency);
  const helpers = load("apps/web/lib/workflows/deriveHelpers.ts");
  assert.deepEqual(helpers.normalizeChildren(out), helpers.normalizeChildren(input));
});

test("discriminant changes discard old input but keep common presentation and unchanged extensions", () => {
  const previous = { id: "a", label: "Action", type: "workflow", workflowKey: "derive.createFromParent", input: { source: { parentTable: "old" } }, confirm: { text: "Yes?" }, visibility: { mode: "always" } };
  const changed = updateFormActionConfig(previous, { workflowKey: "records.copyRelated" });
  assert.deepEqual(changed.input, {});
  assert.deepEqual(changed.confirm, previous.confirm);
  const navigate = updateFormActionConfig(previous, { type: "navigate" });
  assert.equal(navigate.input, undefined);
  assert.equal(navigate.workflowKey, undefined);
  assert.deepEqual(navigate.visibility, previous.visibility);
  const extension = { type: "workflow", workflowKey: "custom.future", input: { future: { value: "" } } };
  assert.deepEqual(serializeFormAction(extension), extension);
});

test("createRelated prefers moduleSlug but retains ambiguous legacy tables", () => {
  assert.deepEqual(serializeFormAction({ type: "createRelated", target: { moduleSlug: "tasks", table: "task_rows" } }).target, { moduleSlug: "tasks" });
  assert.deepEqual(serializeFormAction({ type: "createRelated", target: { table: "task_rows" } }).target, { table: "task_rows" });
});

test("warnings report duplicate runtime aliases and nonvirtual ReverseLinks", () => {
  const warnings = getLegacySchemaWarnings({ fields: [{ name: "children", type: "ReverseLink", virtual: false, appearance: "Always", appareance: "Always" }], ui: { specialViews: [{ type: "planEditor", options: {}, sourceField: "plan", config: { options: {}, sourceField: "plan" } }] } });
  for (const code of ["legacy.appareance", "legacy.planEditor.alias", "legacy.reverseLink.virtual"]) assert.ok(warnings.some(warning => warning.code === code), code);
});

test("modern TreeView identity, partial legacy plans and existing form tabs round-trip", () => {
  const raw = { fields: [], ui: { formSections: [{ id: "main", fields: ["name"] }], tabs: [
    { id: "form", type: "form" },
    { id: "tree", type: "treeview", config: { source: { moduleSlug: "tasks", table: "old_table" }, grouping: { groupByField: "group" }, columns: [] } },
    { id: "plan", type: "planEditor", sourceField: "drawing", options: { width: 500 }, config: { sourceField: "canonical_drawing" } },
  ] } };
  const saved = json(serialize(raw));
  assert.deepEqual(saved.ui.tabs[0].config.formSections[0].fields, ["name"]);
  assert.deepEqual(saved.ui.tabs[1].config.source, { moduleSlug: "tasks" });
  assert.equal(normalize(saved).ui.tabs[1].config.source.table, "tasks");
  assert.equal(saved.ui.tabs[2].config.sourceField, "canonical_drawing");
  assert.equal(saved.ui.tabs[2].config.options.width, 500);
  assert.deepEqual(json(serialize(saved)), saved);
});

test("seed export retains field relations, virtual flags, actions and empty literal data", () => {
  const { exportModuloSeed } = createSourceLoader({ "@repo/types": { serializeModuleSchema: serialize } })("packages/ui/src/ModuloForm/exportModuloSeed.ts");
  const raw = { db: { table: "physical", primaryKey: "uuid" }, fields: [
    { name: "uuid", type: "text", virtual: true },
    { name: "name", type: "text", defaultValue: "", appearance: "Always" },
  ], ui: { formActions: [{ id: "custom", type: "workflow", workflowKey: "budget.generateFromTasks", input: { source: { children: { table: "tasks", fkToParent: "parent" } }, defaults: { child: { blank: "", nullable: null } } } }] } };
  const seed = exportModuloSeed({ slug: "module", tipo: "tabla", props: raw });
  assert.deepEqual(json(seed.props), json(serialize(raw)));
  assert.deepEqual(seed.props.ui.formActions[0].input, raw.ui.formActions[0].input);
});

test("server module save serializes raw legacy JSON before sending it to the database", async () => {
  let payload;
  const query = {
    select() { return query; }, eq() { return query; },
    async maybeSingle() { return { data: { role: "systemadmin" }, error: null }; },
    update(value) { payload = value; return query; },
    async single() { return { data: { id: "saved" }, error: null }; },
  };
  const exports = {
    serializeModuleSchema: serialize,
    ...load("packages/types/fields.ts"), ...load("packages/types/recordName.ts"),
    ...load("packages/types/moduleDefaultFilters.ts"), ...load("packages/types/selectorTableFilters.ts"),
  };
  const { upsertModuloAction } = createSourceLoader({
    "@repo/types": exports,
    "next/cache": { revalidatePath() {} },
    "@/lib/audit/writeAuditEvent": { writeAuditEvent: async () => {} },
    "@/lib/supabase/server": { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "user" } }, error: null }) } }) },
    "@/lib/supabase/admin": { supabaseAdmin: { from: () => query } },
  })("apps/web/actions/modulos.ts");
  const form = new FormData();
  for (const [key, value] of Object.entries({ id: "11111111-1111-4111-8111-111111111111", nombre: "Test", slug: "test", tipo: "tabla", props: JSON.stringify({ table: "physical", fields: [{ name: "name", type: "text", appareance: "Always" }] }) })) form.set(key, value);
  assert.equal((await upsertModuloAction(form)).ok, true);
  assert.equal(payload.props.table, undefined);
  assert.equal(payload.props.db.table, "physical");
  assert.equal(payload.props.fields[0].appearance, "Always");
  assert.equal(payload.props.fields[0].appareance, undefined);
});
