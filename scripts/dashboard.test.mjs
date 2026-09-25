import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import ts from "typescript";
import {
  base,
  loadSource,
  row,
  folder,
  groupsFor,
  dashboardIcon,
  normalizeModuleRoute,
  fixtureRows,
  fixturePerms,
} from "./helpers/dashboard-fixtures.mjs";

const cards = (groups) => groups.flatMap((group) => group.modules);

test("only explicit dashboard true is enabled, independently of sidebar", () => {
  for (const dashboard of [
    false,
    undefined,
    null,
    "true",
    1,
    { featured: true },
  ]) {
    assert.deepEqual(
      groupsFor([
        row("py", {
          props: { db: { table: "py" }, ui: { dashboard, sidebar: true } },
        }),
      ]),
      [],
    );
  }
  for (const sidebar of [false, true]) {
    assert.equal(
      cards(
        groupsFor([
          row("py", {
            props: { db: { table: "py" }, ui: { dashboard: true, sidebar } },
          }),
        ]),
      ).length,
      1,
    );
  }
});

test("invalid configuration cannot crash rendering or create arbitrary links", () => {
  for (const props of [
    null,
    "null",
    "[]",
    "{",
    12,
    { ui: { icon: 34, color: {} } },
  ]) {
    assert.deepEqual(groupsFor([row("clients", { props })]), []);
  }
  const [item] = cards(
    groupsFor([
      row("py", {
        props: {
          db: { table: "py" },
          ui: { dashboard: true, icon: 34, color: {} },
        },
      }),
    ]),
  );
  assert.equal(item.icon, "bi bi-grid-1x2");
  assert.equal(item.color, "#2563eb");
});

test("folders and inactive or duplicate modules do not become cards", () => {
  const groups = groupsFor([
    folder("family", "Familia"),
    row("off", { activo: false }),
    row("clients"),
    row("clients"),
  ]);
  assert.equal(cards(groups).length, 1);
  assert.equal(cards(groups)[0].href, "/m/clients");
});

test("system shortcuts use existing routes; unknown pages are excluded", () => {
  const rows = ["modulos", "rol", "users", "pdf-templates"].map((slug) =>
    row(slug, { route: `/system/${slug}` }),
  );
  for (const item of cards(groupsFor(rows)))
    assert.ok(existsSync(resolve(base, `.${item.href}/page.tsx`)));
  assert.equal(cards(groupsFor(rows)).length, 4);
  for (const route of [
    "/configweb",
    "/system/missing",
    "/login",
    "/403",
    "/",
  ]) {
    assert.deepEqual(groupsFor([row("missing", { route })]), []);
  }
  assert.ok(existsSync(resolve("apps/web/app/api/auth/signout/route.ts")));
});

test("icons accept picker and legacy classes and reject nonexistent icons", () => {
  assert.equal(dashboardIcon("bi-person"), "bi bi-person");
  assert.equal(dashboardIcon("bi bi-person"), "bi bi-person");
  assert.equal(dashboardIcon("bi bi-does-not-exist"), "bi bi-grid-1x2");
  assert.equal(dashboardIcon("🚀"), "bi bi-grid-1x2");
});

test("groups and cards sort by order, name and id independently of query order", () => {
  const rows = [
    folder("b", "B", 2),
    folder("a", "A", 1),
    row("z", { parent_id: "a", orden: 0 }),
    row("c", { parent_id: "a", orden: 2 }),
    row("b1", { parent_id: "b", orden: 0 }),
    row("a1", { parent_id: "a", orden: 2 }),
  ];
  assert.deepEqual(groupsFor(rows), groupsFor([...rows].reverse()));
  assert.deepEqual(
    groupsFor(rows).map((g) => g.name),
    ["A", "B"],
  );
  assert.deepEqual(
    groupsFor(rows)[0].modules.map((m) => m.id),
    ["z", "a1", "c"],
  );
});

test("deep descendants use the highest folder and empty folders are hidden", () => {
  const groups = groupsFor(fixtureRows, fixturePerms);
  assert.deepEqual(
    groups.map((g) => g.name),
    ["Clientes", "Proyectos", "Configuración General"],
  );
  assert.deepEqual(
    groups[1].modules.map((m) => m.id),
    ["py", "task", "mytask"],
  );
  assert.equal(
    fixtureRows.find((r) => r.id === "projects").nombre,
    "Módulo Proyectos",
  );
});

test("root Clients and orphan modules retain their own group without synthetic parents", () => {
  for (const parent_id of [null, "missing-parent"]) {
    const [group] = groupsFor([
      row("customers", { nombre: "Clientes", parent_id }),
    ]);
    assert.equal(group.id, "customers");
    assert.equal(group.name, "Clientes");
    assert.equal(group.modules[0].href, "/m/customers");
  }
});

test("cyclic ancestry does not hang or invent a family", () => {
  assert.deepEqual(
    groupsFor([
      folder("a", "A", 1, "b"),
      folder("b", "B", 2, "a"),
      row("py", { parent_id: "b" }),
    ]),
    [],
  );
  assert.deepEqual(groupsFor([row("py", { parent_id: "py" })]), []);
});

test("real hasPermission produces different dashboards for two users and fails closed", () => {
  const rows = [
    folder("projects", "Proyectos"),
    row("py", { parent_id: "projects" }),
    row("task", { parent_id: "projects" }),
  ];
  assert.deepEqual(
    cards(groupsFor(rows, { py: { ver: true }, task: { ver: true } })).map(
      (m) => m.id,
    ),
    ["py", "task"],
  );
  assert.deepEqual(
    cards(groupsFor(rows, { py: { ver: true }, task: { ver: false } })).map(
      (m) => m.id,
    ),
    ["py"],
  );
  assert.deepEqual(groupsFor(rows, {}), []);
  assert.deepEqual(groupsFor(rows, { "*": { crear: true } }), []);
  assert.equal(cards(groupsFor(rows, { "*": { ver: true } })).length, 2);
});

test("normalization handles relative paths and rejects placeholders, external URLs and traversal", () => {
  assert.equal(normalizeModuleRoute("m/quaterly"), "/m/quaterly");
  assert.equal(normalizeModuleRoute(" /m/py/ "), "/m/py");
  for (const route of [
    null,
    undefined,
    "",
    "#",
    "/#",
    "//evil.test",
    "https://evil.test",
    "javascript:alert(1)",
    "/m/..",
    "/m/%2e%2e",
    "/m/%2f",
    "/m/%252f",
    "/m/py?x=1",
    "/m/%ZZ",
  ]) {
    assert.equal(normalizeModuleRoute(route), null, String(route));
  }
  assert.equal(
    cards(groupsFor([row("quaterly", { route: "m/quaterly" })]))[0].href,
    "/m/quaterly",
  );
});

test("route is primary, dynamic targets must exist and target permissions are checked too", () => {
  const rows = [
    row("card", { route: "/m/py" }),
    row("py", { props: { db: { table: "py" }, ui: { dashboard: false } } }),
  ];
  assert.equal(cards(groupsFor(rows))[0].href, "/m/py");
  assert.deepEqual(groupsFor(rows, { card: { ver: true } }), []);
  assert.deepEqual(groupsFor([row("card", { route: "/m/missing" })]), []);
  assert.deepEqual(groupsFor([row("card", { route: "#" })]), []);
  assert.deepEqual(groupsFor([row("card", { route: null })]), []);
  assert.deepEqual(
    groupsFor([row("card", { props: { ui: { dashboard: true } } })]),
    [],
  );
  const alias = row("actual", {
    route: "/m/table_alias",
    props: { db: { table: "table_alias" }, ui: { dashboard: true } },
  });
  assert.equal(cards(groupsFor([alias]))[0].href, "/m/table_alias");
});

const { applyModuleUiPatch } = loadSource("packages/types/moduleUi.ts");
const { normalizeModuleSchema } = loadSource(
  "packages/types/normalizeModuleSchema.ts",
);
const formSource = readFileSync(
  "packages/ui/src/ModuloForm/ModuloForm.tsx",
  "utf8",
);
const ast = ts.createSourceFile(
  "ModuloForm.tsx",
  formSource,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
let submitSource;
let initializeSource;
let dashboardChangeSource;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === "onSubmit")
    submitSource = node.initializer.getText(ast);
  if (
    ts.isVariableDeclaration(node) &&
    ts.isArrayBindingPattern(node.name) &&
    node.name.elements[0]?.getText(ast) === "propsObj"
  ) {
    initializeSource = node.initializer.arguments[0].getText(ast);
  }
  if (
    ts.isJsxSelfClosingElement(node) &&
    node.tagName.getText(ast) === "input"
  ) {
    const attrs = node.attributes.properties;
    if (
      attrs.some(
        (attr) =>
          ts.isJsxAttribute(attr) &&
          attr.name.getText(ast) === "id" &&
          attr.initializer?.text === "module-dashboard",
      )
    ) {
      dashboardChangeSource = attrs
        .find(
          (attr) =>
            ts.isJsxAttribute(attr) && attr.name.getText(ast) === "onChange",
        )
        .initializer.expression.getText(ast);
    }
  }
  ts.forEachChild(node, visit);
}
visit(ast);
function evaluateArrow(source, bindings, argument) {
  const compiled = ts.transpileModule(`const action = ${source};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return new Function(
    ...Object.keys(bindings),
    "argument",
    `${compiled}; return action(argument);`,
  )(...Object.values(bindings), argument);
}
function toggleDashboard(propsObj, checked) {
  let next;
  let raw;
  evaluateArrow(
    dashboardChangeSource,
    {
      propsObj,
      applyModuleUiPatch,
      setPropsObj: (value) => {
        next = value;
      },
      setRawText: (value) => {
        raw = value;
      },
    },
    { target: { checked } },
  );
  assert.deepEqual(JSON.parse(raw), next);
  return next;
}
async function submit(propsObj) {
  let saved;
  const tasks = [];
  const bindings = {
    propsObj,
    readOnly: false,
    nombre: "Clientes",
    slug: "customers",
    tipo: "tabla",
    orden: 1,
    showRaw: false,
    rawText: "",
    normalizeModuleSchema,
    applyModuleUiPatch,
    validatePropsClient: () => null,
    setMsg: () => {},
    start: (fn) => tasks.push(fn()),
    initialData: { id: "existing" },
    parentId: null,
    route: "/m/customers",
    activo: true,
    onSave: async (fd) => {
      saved = fd;
      return { ok: false, detail: "Captured test persistence" };
    },
    searchParams: new URLSearchParams(),
    router: {},
    FormData,
  };
  const compiled = ts.transpileModule(`const submit = ${submitSource};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function(
    ...Object.keys(bindings),
    `${compiled}; submit({ preventDefault() {} });`,
  )(...Object.values(bindings));
  await Promise.all(tasks);
  return JSON.parse(saved.get("props"));
}

test("ModuloForm save preserves sidebar, icon, color and unrelated ui in cases A and B", async () => {
  for (const sidebar of [true, false]) {
    const initial = {
      db: { table: "customers" },
      fields: [],
      audit: { enabled: true },
      ui: {
        sidebar,
        icon: "bi-people",
        color: "#35797e",
        custom: { keep: true },
      },
    };
    const enabled = await submit(toggleDashboard(initial, true));
    assert.equal(enabled.ui.dashboard, true);
    const disabled = await submit(toggleDashboard(enabled, false));
    assert.equal(disabled.ui.dashboard, false);
    for (const result of [enabled, disabled]) {
      for (const key of ["sidebar", "icon", "color", "custom"])
        assert.deepEqual(result.ui[key], initial.ui[key]);
      assert.deepEqual(result.audit, initial.audit);
    }
    assert.equal(initial.ui.dashboard, undefined);
  }
});

test("legacy and new module save defaults to false; checkbox reads strict true", async () => {
  for (const initialData of [
    undefined,
    { props: { ui: { sidebar: true } } },
    { props: JSON.stringify({ ui: { sidebar: false } }) },
  ]) {
    const initialized = evaluateArrow(initializeSource, {
      initialData,
      normalizeModuleSchema,
    });
    assert.equal(initialized.ui.dashboard, false);
  }
  const initialized = evaluateArrow(initializeSource, {
    initialData: {
      props: { ui: { dashboard: true, sidebar: true, icon: "bi-people" } },
    },
    normalizeModuleSchema,
  });
  assert.equal(initialized.ui.dashboard, true);
  assert.equal(initialized.ui.sidebar, true);
  const props = await submit({
    db: { table: "customers" },
    fields: [],
    ui: {},
  });
  assert.equal(props.ui.dashboard, false);
  assert.match(formSource, /checked=\{propsObj\.ui\?\.dashboard === true\}/);
  assert.match(formSource, /dashboard: false/);
  assert.match(formSource, /htmlFor="module-sidebar"/);
  assert.ok(
    formSource.indexOf('id="module-sidebar"') >
      formSource.indexOf('{editorTab === "ui"'),
  );
});

test("PDF template access checks the existing pdf_templates guard key", () => {
  const rows = [row("pdf_templates", { route: "/system/pdf-templates" })];
  assert.equal(
    cards(groupsFor(rows, { pdf_templates: { ver: true } })).length,
    1,
  );
  assert.deepEqual(groupsFor(rows, { "pdf-templates": { ver: true } }), []);
});

test("legacy aliases also require permission for the URL slug used by ListPageClient", () => {
  const rows = [
    row("actual", {
      route: "/m/alias",
      props: { db: { table: "alias" }, ui: { dashboard: true } },
    }),
  ];
  assert.deepEqual(groupsFor(rows, { actual: { ver: true } }), []);
  assert.equal(
    cards(groupsFor(rows, { actual: { ver: true }, alias: { ver: true } }))
      .length,
    1,
  );
});

test("ambiguous slugs cannot validate a dynamic destination", () => {
  assert.deepEqual(groupsFor([row("py"), row("py", { id: "duplicate" })]), []);
});
