import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

const read = (file) => readFileSync(resolve(file), "utf8");
function load(file, imports = {}, suffix = "") {
  const { outputText } = ts.transpileModule(read(file) + suffix, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
    fileName: file,
  });
  const module = { exports: {} };
  new Function("require", "module", "exports", outputText)((name) => {
    assert.ok(name in imports, `Unexpected dependency ${name} in ${file}`);
    return imports[name];
  }, module, module.exports);
  return module.exports;
}
const metadata = load("packages/types/workflows.ts");
const errors = load("apps/web/lib/auth/apiError.ts");
const common = load("apps/web/lib/validation/common.ts", { "@/lib/auth/apiError": errors });
const validation = load("apps/web/lib/validation/workflows.ts", { "./common": common, "@/lib/auth/apiError": errors });
const config = () => ({
  source: { table: "blueprints", match: { field: "group_id", valueFromRecord: "selected_group" } },
  target: { table: "entries", parentField: "owner_id" },
  map: { title: "name", priority: "rank" },
  defaults: { status: "pending", title: "overridden", owner_id: "incorrect" },
  dedupe: { enabled: true, sourceIdField: "id", targetSourceIdField: "blueprint_id" },
});

function backend({ existing = [], sources = [
  { id: "s1", group_id: "chosen", name: "One", rank: 2 },
  { id: "s2", group_id: "chosen", name: "Two", rank: 3 },
  { id: "other", group_id: "another", name: "Other", rank: 0 },
], record = { pk: "parent", selected_group: "chosen" }, pageSize = 500, failRead, failInsert } = {}) {
  const tables = { parent_table: record ? [record] : [], source_table: sources, target_table: [...existing] };
  const inserts = [];
  const calls = [];
  const resolutions = [];
  const client = { from(table) {
    let filters = [];
    const query = {
      select(columns, options) { calls.push({ table, columns, options }); return query; },
      eq(field, value) { filters.push([field, value]); calls.push({ table, field, value }); return query; },
      order() { return query; },
      async maybeSingle() { return { data: tables[table].find((row) => filters.every(([f, v]) => row[f] === v)), error: null }; },
      async range(start, end) {
        if (failRead === table) return { error: { message: "read denied" } };
        const matching = tables[table].filter((row) => filters.every(([f, v]) => row[f] === v));
        return { data: matching.slice(start, Math.min(end + 1, start + pageSize)), count: matching.length, error: null };
      },
      async insert(rows) {
        inserts.push({ table, rows });
        if (failInsert) return { error: failInsert };
        tables[table].push(...rows);
        return { error: null };
      },
    };
    return query;
  }, schema() { return client; } };
  const modules = { parents: ["parent_table", "pk"], blueprints: ["source_table", "id"], entries: ["target_table", "id"] };
  const { recordsCopyRelated } = load("apps/web/lib/workflows/records.copyRelated.ts", {
    "@/lib/supabase/server": { createClient: async () => client },
    "@/lib/modules/resolveModuleConfig": { resolveModuleConfig: async (ref) => {
      resolutions.push(ref);
      const spec = modules[ref] || Object.values(modules).find(([table]) => table === ref);
      if (!spec) throw new Error("Modulo no encontrado");
      return { slug: ref, table: spec[0], primaryKey: spec[1] };
    } },
    "@/lib/auth/apiError": errors,
    "@/lib/validation/workflows": validation,
  });
  return { run: (input = config(), context = { recordId: "parent", tableSlug: "parents" }) => recordsCopyRelated({ context, input }), inserts, calls, resolutions };
}

describe("records.copyRelated", () => {
  it("reads the configured current-record value, maps multiple sources, defaults, parent and source identity in one bulk insert", async () => {
    const api = backend();
    assert.deepEqual((await api.run()).result, { matched: 2, created: 2, skipped: 0 });
    assert.deepEqual(api.resolutions, ["parents", "blueprints", "entries"]);
    assert.ok(api.calls.some((call) => call.table === "source_table" && call.field === "group_id" && call.value === "chosen"));
    assert.deepEqual(api.inserts, [{ table: "target_table", rows: [
      { title: "One", priority: 2, status: "pending", owner_id: "parent", blueprint_id: "s1" },
      { title: "Two", priority: 3, status: "pending", owner_id: "parent", blueprint_id: "s2" },
    ] }]);
  });
  it("disabled dedupe creates all, including repeated invocations", async () => {
    const api = backend();
    const input = config(); input.dedupe.enabled = false;
    assert.equal((await api.run(input)).result.created, 2);
    assert.equal((await api.run(input)).result.created, 2);
    assert.equal(api.inserts[0].rows[0].blueprint_id, undefined);
  });
  it("enabled dedupe skips only identities for the same parent and handles reruns", async () => {
    const api = backend({ existing: [{ owner_id: "parent", blueprint_id: "s1" }, { owner_id: "another", blueprint_id: "s2" }] });
    assert.deepEqual((await api.run()).result, { matched: 2, created: 1, skipped: 1 });
    assert.deepEqual((await api.run()).result, { matched: 2, created: 0, skipped: 2 });
    assert.equal(api.inserts.length, 1);
  });
  it("paginates source and existing rows even when the server caps pages below the requested size", async () => {
    const api = backend({ pageSize: 1, existing: [{ owner_id: "parent", blueprint_id: "irrelevant" }, { owner_id: "parent", blueprint_id: "s2" }] });
    assert.deepEqual((await api.run()).result, { matched: 2, created: 1, skipped: 1 });
  });
  it("zero matches and an unselected relation return zero without inserting", async () => {
    for (const options of [{ sources: [] }, { record: { pk: "parent", selected_group: null } }]) {
      const api = backend(options);
      assert.deepEqual((await api.run()).result, { matched: 0, created: 0, skipped: 0 });
      assert.equal(api.inserts.length, 0);
    }
  });
  it("deduplicates repeated logical source identities inside the batch", async () => {
    const api = backend({ sources: [1, 2].map(() => ({ id: "same", group_id: "chosen", name: "One", rank: 1 })) });
    assert.deepEqual((await api.run()).result, { matched: 2, created: 1, skipped: 1 });
  });
  it("fails before insertion on missing record, match field, source identity, mapping or unresolved modules", async () => {
    for (const [options, change, message] of [
      [{ record: null }, () => {}, /Registro actual/],
      [{ record: { pk: "parent" } }, () => {}, /selected_group/],
      [{}, (input) => { input.dedupe.sourceIdField = "missing"; }, /identidad valida/],
      [{}, (input) => { input.map.title = "missing"; }, /mapping/],
      [{}, (input) => { input.target.table = "unregistered_table"; }, /Modulo/],
      [{ failRead: "source_table" }, () => {}, /read denied/],
      [{ failRead: "target_table" }, () => {}, /read denied/],
    ]) {
      const api = backend(options); const input = config(); change(input);
      await assert.rejects(api.run(input), message);
      assert.equal(api.inserts.length, 0);
    }
  });
  it("propagates bulk failures and unique conflicts without partial insert retries", async () => {
    for (const error of [{ message: "RLS denied" }, { code: "23505", message: "unique" }]) {
      const api = backend({ failInsert: error });
      await assert.rejects(api.run(), error.code ? /unicidad/ : /RLS denied/);
      assert.equal(api.inserts.length, 1);
    }
  });
  it("accepts registered physical table aliases and context.table", async () => {
    const api = backend(); const input = config(); input.source.table = "source_table";
    assert.equal((await api.run(input, { recordId: "parent", table: "parent_table" })).result.created, 2);
  });
});

describe("workflow validation and compatibility", () => {
  it("rejects invalid inputs with readable 400 errors", () => {
    const mutations = [
      (v) => { v.source.table = " "; }, (v) => { v.source.match.field = ""; },
      (v) => { v.source.match.valueFromRecord = ""; }, (v) => { v.target.table = ""; },
      (v) => { v.target.parentField = ""; }, (v) => { v.map = []; }, (v) => { v.defaults = []; },
      (v) => { v.dedupe.sourceIdField = ""; }, (v) => { v.dedupe.targetSourceIdField = ""; },
      (v) => { v.dedupe.enabled = "true"; }, (v) => { v.map = { "": "name" }; },
      (v) => { v.map = { name: "relation(*)" }; }, (v) => { v.dedupe.targetSourceIdField = "owner_id"; },
      (v) => { v.defaults = JSON.parse('{"__proto__": 1}'); },
    ];
    for (const mutate of mutations) {
      const input = config(); mutate(input);
      assert.throws(() => validation.parseCopyRelatedInput(input), (error) => error.status === 400 && error.message.length > 10);
    }
    assert.throws(() => validation.parseCopyRelatedInput(null), /input debe ser un objeto/);
  });
  it("keeps old handlers, registers the new one and synchronizes executable keys with the UI catalog", async () => {
    const calls = [];
    const handler = (name) => async (args) => { calls.push([name, args]); return { result: { id: "old-result" } }; };
    const registry = load("apps/web/lib/workflows/index.ts", {
      "@repo/types": metadata,
      "./derive.createFromParent": { deriveCreateFromParent: handler("derive") },
      "./budget.generateFromTasks": { budgetGenerateFromTasks: handler("budget") },
      "./records.copyRelated": { recordsCopyRelated: handler("copy") },
    });
    assert.deepEqual(Object.keys(registry.workflowRegistry).sort(), metadata.WORKFLOW_CATALOG.map((item) => item.key).sort());
    assert.deepEqual(Object.values(registry.WORKFLOW_KEYS).sort(), ["budget.generateFromTasks", "derive.createFromParent", "records.copyRelated"]);
    for (const workflowKey of ["derive.createFromParent", "budget.generateFromTasks"]) {
      const args = { workflowKey, context: { recordId: "id" }, input: { legacy: true } };
      assert.deepEqual(await registry.runWorkflow(args), { result: { id: "old-result" } });
      assert.deepEqual(calls.at(-1)[1], { context: args.context, input: args.input });
    }
    for (const workflowKey of ["invoice.generateFromBudget", "unknown", "toString", "__proto__", "constructor"]) {
      await assert.rejects(registry.runWorkflow({ workflowKey, context: { recordId: "id" } }), /no soportado/);
    }
    assert.match(read("apps/web/lib/workflows/runWorkflow.ts"), /export \{ runWorkflow \} from "\.\/index"/);
  });
  it("preserves legacy derive children normalization", () => {
    const helpers = load("apps/web/lib/workflows/deriveHelpers.ts");
    const old = { source: { parentTable: "a", children: { table: "b", fkToParent: "a_id" } }, target: { parentTable: "c", children: { table: "d", fkToParent: "c_id" } }, maps: { child: { title: "name" } } };
    const normalized = helpers.normalizeDeriveInput(old);
    assert.equal(normalized.children[0].sourceTable, "b");
    assert.deepEqual(normalized.children[0].map, { title: "name" });
    assert.deepEqual(old.maps, { child: { title: "name" } });
  });
  it("keeps both endpoint permission checks and the executable-key allowlist", () => {
    const route = read("apps/web/app/api/workflows/run/route.ts");
    assert.match(route, /requirePermission\("workflows.run"\)/);
    assert.match(route, /requirePermission\(`workflows\.\$\{body.workflowKey\}`\)/);
    assert.match(route, /Object.values\(WORKFLOW_KEYS\)/);
  });
  it("FormAction and ModuleUiSchema accept workflow while retaining external configurations without a type", () => {
    const filename = resolve("scripts/workflow-type-fixture.ts");
    const fixture = `import type { FormAction, WorkflowAction, ModuleUiSchema } from "../packages/types";
      const action: WorkflowAction = { id: "old", label: "Old", type: "workflow", workflowKey: "legacy.unknown", input: { old: true }, after: { navigateTo: "/{{result.id}}" } };
      const actions: FormAction[] = [action, { id: "pdf", label: "PDF", kind: "pdf" }];
      const ui: ModuleUiSchema = { formActions: actions }; void ui;`;
    const options = { noEmit: true, skipLibCheck: true, strict: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, types: ["react", "node"] };
    const host = ts.createCompilerHost(options);
    const original = host.getSourceFile.bind(host);
    host.getSourceFile = (name, language, ...args) => resolve(name) === filename ? ts.createSourceFile(name, fixture, language, true) : original(name, language, ...args);
    const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram([filename], options, host));
    assert.deepEqual(diagnostics.map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n")), []);
  });
});

// Small hook harness: execute the real event handlers without a browser or extra dependencies.
function hooks() {
  const slots = []; let cursor = 0; let effects = [];
  const react = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children: children.flat(Infinity) } }),
    Fragment: "fragment",
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
      return [slots[index], (value) => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }];
    },
    useRef(initial) { const [ref] = react.useState(() => ({ current: initial })); return ref; },
    useMemo(fn) { return fn(); },
    useEffect(fn, deps) {
      const index = cursor++;
      if (!slots[index] || deps.some((value, i) => value !== slots[index][i])) { slots[index] = deps; effects.push(fn); }
    },
  };
  return { react: { ...react, default: react }, render(component, props) {
    cursor = 0; effects = [];
    const tree = component(props);
    for (const effect of effects) effect();
    return tree;
  } };
}
function findAll(tree, predicate) {
  if (!tree || typeof tree !== "object") return [];
  return [...(predicate(tree) ? [tree] : []), ...(tree.props?.children || []).flatMap((child) => findAll(child, predicate))];
}

describe("workflow actions and editor behavior", () => {
  it("new workflow actions start with a neutral input instead of inheriting another workflow contract", () => {
    const h = hooks();
    const editor = load("packages/ui/src/ModuloForm/UiFormActionsEditor.tsx", {
      react: h.react, "@repo/types": metadata,
      "../components/fields/Selector": {}, "./FieldRow": {}, "./CopyRelatedWorkflowEditor": {},
    });
    let saved;
    const props = { value: [], onChange: (next) => { saved = next; }, styles: {}, sourceFields: [], getTableFields: () => [] };
    let tree = h.render(editor.default, props);
    findAll(tree, (node) => node.type === "select")[0].props.onChange({ target: { value: "workflow" } });
    tree = h.render(editor.default, props);
    findAll(tree, (node) => node.type === "button")[0].props.onClick();
    assert.equal(saved[0].type, "workflow");
    assert.equal(saved[0].workflowKey, "");
    assert.deepEqual(saved[0].input, {});
  });
  it("configures the entire copy contract visually using dynamically loaded fields", () => {
    const h = hooks(); const Selector = () => {};
    const editor = load("packages/ui/src/ModuloForm/CopyRelatedWorkflowEditor.tsx", {
      react: h.react, "../components/fields/Selector": { default: Selector },
    }, "\nexport { PairsEditor, FieldSelect };\n");
    const loaded = [];
    const fields = {
      blueprints: ["group_id", "name", "rank"].map((name) => ({ name })),
      entries: ["owner_id", "title", "priority", "status", "blueprint_id"].map((name) => ({ name })),
    };
    const props = { value: {}, styles: {}, sourceFields: [{ name: "selected_group" }],
      getTableFields: (table) => fields[table], ensureTableFields: (table) => loaded.push(table),
      onChange: (value) => { props.value = value; } };
    const tree = () => h.render(editor.default, props);
    findAll(tree(), (node) => node.type === Selector)[0].props.onChange("blueprints");
    findAll(tree(), (node) => node.type === Selector)[1].props.onChange("entries");
    const select = (label, value) => findAll(tree(), (node) => node.type === editor.FieldSelect && node.props.label === label)[0].props.onChange(value);
    select("Campo del origen a comparar", "group_id");
    select("Valor desde el registro actual", "selected_group");
    select("Campo que recibe el ID del registro actual", "owner_id");
    findAll(tree(), (node) => node.type === editor.PairsEditor && !node.props.literals)[0].props.onChange({ title: "name", priority: "rank" });
    findAll(tree(), (node) => node.type === editor.PairsEditor && node.props.literals)[0].props.onChange({ status: "pending" });
    findAll(tree(), (node) => node.type === "input" && node.props.type === "checkbox")[0].props.onChange({ target: { checked: true } });
    const identity = findAll(tree(), (node) => node.type === editor.FieldSelect && node.props.label === "Identificador del origen")[0];
    // Primary keys need not be present in the module's configurable form fields.
    findAll(editor.FieldSelect(identity.props), (node) => node.type === "input")[0].props.onChange({ target: { value: "id" } });
    select("Campo destino que guarda el identificador del origen", "blueprint_id");
    const expected = config(); expected.defaults = { status: "pending" };
    assert.deepEqual(validation.parseCopyRelatedInput(props.value), expected);
    assert.ok(loaded.includes("blueprints") && loaded.includes("entries"));
  });
  it("raw JSON retains the last valid input when invalid and accepts nested values without flattening", () => {
    const h = hooks();
    const editor = load("packages/ui/src/ModuloForm/CopyRelatedWorkflowEditor.tsx", { react: h.react, "../components/fields/Selector": {} });
    const initial = { nested: { list: [1, 2] } };
    let saved = initial;
    const props = { value: initial, styles: {}, onChange: (next) => { saved = next; props.value = next; } };
    const textarea = () => findAll(h.render(editor.WorkflowJsonEditor, props), (node) => node.type === "textarea")[0];
    textarea().props.onChange({ target: { value: "invalid" } });
    textarea().props.onBlur();
    assert.equal(saved, initial);
    assert.equal(findAll(h.render(editor.WorkflowJsonEditor, props), (node) => node.props.role === "alert").length, 1);
    textarea().props.onChange({ target: { value: '{"nested":{"list":[false,null,3]}}' } });
    textarea().props.onBlur();
    assert.deepEqual(saved, { nested: { list: [false, null, 3] } });
  });
  it("old workflow actions keep their payload and navigation; double clicks are ignored, keys are per execution and counts displayed", async () => {
    const h = hooks(); const menu = () => {};
    const { default: Bar } = load("packages/ui/src/ModuloForm/FormActionsBar.tsx", {
      react: h.react,
      "../ActionMenu": { ActionMenu: menu },
      "../engines/computeEngine": {}, "../providers/DataProvider": {}, "../pdf": {},
      "../engines/visibilityEngine": { evaluateActionVisibility: () => true },
    });
    const originalFetch = globalThis.fetch;
    const requests = []; let finish;
    globalThis.fetch = async (url, request) => {
      requests.push({ url, ...request });
      await new Promise((resolve) => { finish = resolve; });
      return { ok: true, json: async () => ({ ok: true, result: { id: "made", matched: 18, created: 6, skipped: 12 } }) };
    };
    try {
      const action = { id: "old", label: "Old", type: "workflow", workflowKey: "derive.createFromParent", input: { source: { parentTable: "parents" } }, after: { navigateTo: "/records/{{result.id}}" } };
      const navigations = [];
      const props = { schema: { slug: "parents" }, values: { id: "parent" }, mode: "view", actions: [action], navigate: (href) => navigations.push(href) };
      const click = () => findAll(h.render(Bar, props), (node) => node.type === menu)[0].props.items[0].onClick();
      const first = click(); const duplicate = click();
      assert.equal(requests.length, 1);
      assert.equal(findAll(h.render(Bar, props), (node) => node.type === menu)[0].props.items[0].disabled, true);
      finish(); await Promise.all([first, duplicate]);
      assert.deepEqual(JSON.parse(requests[0].body), { workflowKey: action.workflowKey, context: { recordId: "parent", tableSlug: "parents" }, input: action.input });
      assert.deepEqual(navigations, ["/records/made"]);
      assert.match(findAll(h.render(Bar, props), (node) => node.props.role === "status")[0].props.children.join(""), /18.*6.*12/);
      const second = click(); finish(); await second;
      assert.notEqual(requests[0].headers["Idempotency-Key"], requests[1].headers["Idempotency-Key"]);
      assert.equal("Idempotency-Key" in action, false);
    } finally { globalThis.fetch = originalFetch; }
  });
  it("unknown legacy workflows keep their selected key and nested input when editing and saving another property", () => {
    const h = hooks(); const raw = () => {};
    const editor = load("packages/ui/src/ModuloForm/UiFormActionsEditor.tsx", {
      react: h.react, "@repo/types": metadata,
      "../components/fields/Selector": {}, "./FieldRow": {},
      "./CopyRelatedWorkflowEditor": { WorkflowJsonEditor: raw },
    }, "\nexport { UiFormActionItem };\n");
    let action = { id: "legacy", label: "Legacy", type: "workflow", workflowKey: "invoice.generateFromBudget", input: { nested: { untouched: [1, 2, 3] } } };
    const snapshot = structuredClone(action);
    const props = { idx: 0, action, styles: {}, sourceFields: [], getTableFields: () => [],
      updateFormAction: (_, patch) => { action = { ...action, ...patch }; } };
    const tree = h.render(editor.UiFormActionItem, props);
    assert.equal(findAll(tree, (node) => node.type === "option" && node.props.value === snapshot.workflowKey).length, 1);
    assert.equal(findAll(tree, (node) => node.props.role === "alert").length, 1);
    assert.equal(findAll(tree, (node) => node.type === raw)[0].props.value, action.input);
    findAll(tree, (node) => node.type === "input")[0].props.onChange({ target: { value: "/saved" } });
    const saved = JSON.parse(JSON.stringify(action));
    assert.equal(saved.workflowKey, snapshot.workflowKey);
    assert.deepEqual(saved.input, snapshot.input);
    assert.equal(saved.after.navigateTo, "/saved");
  });
  it("visual mapping/default rows survive partially completed edits and preserve literal types", () => {
    const h = hooks();
    const editor = load("packages/ui/src/ModuloForm/CopyRelatedWorkflowEditor.tsx", {
      react: h.react, "../components/fields/Selector": {},
    }, "\nexport { PairsEditor, FieldSelect };\n");
    let value = {};
    const props = { value, sourceFields: [], targetFields: [], styles: {}, onChange: (next) => { value = next; props.value = next; } };
    let tree = h.render(editor.PairsEditor, props);
    findAll(tree, (node) => node.type === "button").at(-1).props.onClick();
    tree = h.render(editor.PairsEditor, props);
    let selects = findAll(tree, (node) => node.type === editor.FieldSelect);
    selects[0].props.onChange("title");
    tree = h.render(editor.PairsEditor, props);
    selects = findAll(tree, (node) => node.type === editor.FieldSelect);
    assert.equal(selects[0].props.value, "title");
    selects[1].props.onChange("name");
    assert.deepEqual(value, { title: "name" });

    const d = hooks();
    const defaults = load("packages/ui/src/ModuloForm/CopyRelatedWorkflowEditor.tsx", {
      react: d.react, "../components/fields/Selector": {},
    }, "\nexport { PairsEditor, FieldSelect };\n");
    let literals = { status: "pending", data: { nested: true }, empty: null };
    const defaultProps = { ...props, literals: true, value: literals, onChange: (next) => { literals = next; defaultProps.value = next; } };
    tree = d.render(defaults.PairsEditor, defaultProps);
    findAll(tree, (node) => node.type === "input")[0].props.onChange({ target: { value: '"42"' } });
    assert.deepEqual(literals, { status: "42", data: { nested: true }, empty: null });
  });
});
