import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(resolve("apps/web/package.json"));
function loader(overrides = {}) {
  const cache = new Map();
  return function load(file) {
    const path = resolve(file);
    if (cache.has(path)) return cache.get(path);
    const code = ts.transpileModule(readFileSync(path, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText;
    const result = { exports: {} };
    new Function("require", "module", "exports", code)((id) => {
      if (id in overrides) return overrides[id];
      if (id === "@repo/types") return load("packages/types/recordName.ts");
      if (id.startsWith(".")) {
        const target = resolve(dirname(path), id);
        return load(target + (existsSync(target + ".ts") ? ".ts" : ".tsx"));
      }
      return require(id);
    }, result, result.exports);
    cache.set(path, result.exports);
    return result.exports;
  };
}
const load = loader();
const { filterSidebarTree, getSelectableModules, findModuleForPath, selectSidebarModule, getStandaloneItems, getActiveSidebarIds } = load("packages/ui/src/sidebarTree.ts");
const link = (id, overrides = {}) => ({ id, slug: id, nombre: id, tipo: "tabla", route: `/m/${id}`, icon: "bi-box", ...overrides });
const folder = (id, hijos, overrides = {}) => link(id, { tipo: "carpeta", route: undefined, hijos, icon: "bi-folder2", ...overrides });
const fixture = () => [
  folder("operations", [link("projects"), folder("nested", [link("tasks", { tipo: "vista" })]), link("secret")], { orden: 2 }),
  folder("finance", [link("invoices")], { orden: 1 }),
  folder("empty", []),
  link("home", { route: "/" }),
];
const permitted = (slug) => slug !== "secret";

test("filters permissions, prunes empty modules, sorts by orden and preserves hierarchy/icons/views without mutation", () => {
  const original = fixture(); const snapshot = structuredClone(original);
  const tree = filterSidebarTree(original, permitted);
  assert.deepEqual(getSelectableModules(tree).map((node) => node.id), ["finance", "operations", "nested"]);
  assert.deepEqual(tree[1].hijos.map((node) => node.id), ["nested", "projects"]);
  assert.equal(tree[1].hijos[0].hijos[0].tipo, "vista");
  assert.equal(tree[1].hijos[0].hijos[0].icon, "bi-box");
  assert.equal(getSelectableModules(tree)[2].moduleLabel, "operations / nested");
  assert.deepEqual(original, snapshot);
  assert.deepEqual(filterSidebarTree(original, () => false), []);
});

test("preserves ui.sidebar promotion, inferred folders and the existing denied-parent gate", () => {
  const tree = [folder("module", [link("hidden", { sidebar: true, hijos: [link("child")] }), link("leaf", { sidebar: true }), link("denied", { hijos: [link("allowed")] })])];
  const filtered = filterSidebarTree(tree, (slug) => slug !== "denied");
  assert.deepEqual(filtered[0].hijos.map((node) => node.id), ["child"]);
  assert.equal(findModuleForPath(filtered, "/m/child/42").id, "module");
  assert.equal(filterSidebarTree([folder("only-disabled", [link("off", { route: "#" })])]).length, 0);
  assert.equal(filterSidebarTree([link("container", { route: "", hijos: [link("ok")] })], (slug) => slug === "ok").length, 1);
});

test("selects the deepest owning folder and longest matching route with segment boundaries", () => {
  const tree = filterSidebarTree(fixture(), permitted);
  assert.equal(findModuleForPath(tree, "/m/tasks/42/edit").id, "nested");
  assert.equal(findModuleForPath(tree, "/m/projects/").id, "operations");
  assert.equal(findModuleForPath(tree, "/m/projects-archive"), undefined);
  assert.equal(findModuleForPath(tree, "/m/secret"), undefined);
  assert.equal(findModuleForPath(tree, "/"), undefined);
  const overlap = [folder("a", [link("a", { route: "/m/a" })]), folder("b", [link("b", { route: "/m/a/special" })])];
  assert.equal(findModuleForPath(overlap, "/m/a/special/1").id, "b");
});

test("URL beats persisted selection; manual selection works until navigation and unavailable saved modules are ignored", () => {
  const tree = filterSidebarTree(fixture(), permitted);
  assert.equal(selectSidebarModule(tree, "/m/tasks/42", { id: "finance", pathname: "" }).id, "nested");
  assert.equal(selectSidebarModule(tree, "/", { id: "operations", pathname: "" }).id, "operations");
  assert.equal(selectSidebarModule(tree, "/m/tasks/42", { id: "finance", pathname: "/m/tasks/42" }).id, "finance");
  assert.equal(selectSidebarModule(tree, "/m/tasks/43", { id: "finance", pathname: "/m/tasks/42" }).id, "nested");
  assert.equal(selectSidebarModule(tree, "/unknown", { id: "removed", pathname: "" }).id, "finance");
  assert.equal(selectSidebarModule([], "/", { id: "removed", pathname: "" }), undefined);
});

test("standalone special links stay available without exposing other folder contents", () => {
  const tree = filterSidebarTree(fixture(), permitted);
  assert.deepEqual(getStandaloneItems(tree).map((node) => node.id), ["home"]);
  assert.deepEqual([...getActiveSidebarIds(tree, "/m/tasks/42")].sort(), ["nested", "operations", "tasks"]);
});

const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
function renderSidebar(pathname, props = {}) {
  const { Sidebar } = loader({ "next/navigation": { usePathname: () => pathname } })("packages/ui/src/Sidebar.tsx");
  return renderToStaticMarkup(React.createElement(Sidebar, { items: fixture(), canView: permitted, ...props }));
}

test("desktop and mobile use the same selector and show only the selected navigation plus standalone links", () => {
  for (const variant of ["fixed", "drawer"]) {
    const html = renderSidebar("/m/tasks/42", { variant, isOpen: true });
    assert.match(html, /aria-label="Módulo: nested"/);
    assert.doesNotMatch(html, /<select/);
    assert.match(html, /href="\/m\/tasks"/);
    assert.doesNotMatch(html, /href="\/m\/projects"|href="\/m\/invoices"|secret/);
    assert.match(html, /href="\/"/);
  }
});

test("mini renders configured icons, hidden labels, compact selector and accessible folder controls", () => {
  const html = renderSidebar("/m/projects/42", { miniMode: true });
  assert.match(html, /sidebar-module-selector is-mini/);
  assert.match(html, /bi-folder2/);
  assert.match(html, /bi-box sidebar-item-icon/);
  assert.doesNotMatch(html, /sidebar-item-icon is-hidden/);
  assert.match(html, /sidebar-item-label is-hidden/);
  assert.match(html, /aria-label="nested" aria-expanded="false"/);
  const trigger = html.match(/<button[^>]*sidebar-module-trigger[\s\S]*?<\/button>/)[0];
  assert.match(trigger, /title="operations"/);
  assert.match(trigger, /bi-folder2/);
  assert.doesNotMatch(trigger, /sidebar-module-name|bi-chevron-down/);
});

test("module ActionMenu uses accessible folder icons and changes the displayed navigation in both variants", async () => {
  for (const variant of ["fixed", "drawer"]) {
    let selection = { id: "operations", pathname: "/m/projects" };
    const hooks = {
      useState: (initial) => [typeof initial === "function" ? initial() : initial, () => {}],
      useRef: (initial) => ({ current: initial }), useMemo: (fn) => fn(), useEffect: () => {},
    };
    const { Sidebar } = loader({ react: hooks, "next/navigation": { usePathname: () => "/m/projects" } })("packages/ui/src/Sidebar.tsx");
    const visit = (node, predicate) => !node || typeof node !== "object" ? [] : [
      ...(predicate(node) ? [node] : []), ...React.Children.toArray(node.props?.children).flatMap((child) => visit(child, predicate)),
    ];
    const render = () => Sidebar({ items: fixture(), canView: permitted, variant, moduleSelection: selection, onModuleChange: (next) => { selection = next; } });
    const menu = visit(render(), (node) => node.props.triggerClassName === "sidebar-module-trigger")[0];
    assert.equal(menu.type.name, "ActionMenu");
    assert.equal(menu.props.menuClassName, "sidebar-module-menu");
    assert.deepEqual(menu.props.items.map((item) => item.label), ["finance", "operations", "nested"]);
    assert.ok(menu.props.items.every((item) => item.icon.props.className === "bi bi-folder2"));
    await menu.props.items[0].onClick();
    assert.deepEqual(selection, { id: "finance", pathname: "/m/projects" });
    assert.equal(visit(render(), (node) => node.props.nodes?.some((item) => item.id === "invoices")).length, 1);
    assert.equal(visit(render(), (node) => node.props.nodes?.some((item) => item.id === "projects")).length, 0);
  }
});

test("ActionMenu retains its default trigger and opens/closes custom triggers with existing option icons", async () => {
  const { ActionMenu: DefaultMenu } = loader()("packages/ui/src/ActionMenu.tsx");
  const defaultHtml = renderToStaticMarkup(React.createElement(DefaultMenu, { items: [] }));
  assert.match(defaultHtml, /class="am-dots"/);
  const slots = []; let cursor = 0; let clicked = 0;
  const hooks = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], (next) => { slots[i] = typeof next === "function" ? next(slots[i]) : next; }]; },
    useRef(initial) { const [ref] = hooks.useState({ current: initial }); return ref; },
    useMemo: (fn) => fn(), useEffect: (fn) => { fn(); }, useLayoutEffect: () => {},
  };
  const oldWindow = globalThis.window, oldDocument = globalThis.document;
  const events = { addEventListener() {}, removeEventListener() {} };
  globalThis.window = events; globalThis.document = { ...events, body: {} };
  try {
    const { ActionMenu } = loader({ react: hooks, "react-dom": { createPortal: (node) => node } })("packages/ui/src/ActionMenu.tsx");
    const visit = (node, predicate) => !node || typeof node !== "object" ? [] : [
      ...(predicate(node) ? [node] : []), ...React.Children.toArray(node.props?.children).flatMap((child) => visit(child, predicate)),
    ];
    const render = () => { cursor = 0; return ActionMenu({
      trigger: React.createElement("i", { className: "bi bi-box" }), triggerTitle: "Compras", triggerClassName: "custom-trigger", menuClassName: "custom-menu",
      items: [{ label: "Compras", icon: React.createElement("i", { className: "bi bi-box" }), onClick: () => { clicked++; } }, { label: "Hidden", hidden: true }],
    }); };
    let tree = render();
    const button = visit(tree, (node) => node.type === "button")[0];
    assert.equal(button.props.title, "Compras");
    assert.match(button.props.className, /custom-trigger/);
    assert.equal(visit(tree, (node) => node.props.className === "am-dots").length, 0);
    button.props.onClick(); tree = render();
    const options = visit(tree, (node) => node.props.role === "menuitem");
    assert.equal(visit(tree, (node) => node.props.role === "menu")[0].props.className, "am-menu custom-menu");
    assert.equal(options.length, 1);
    assert.equal(visit(options[0], (node) => node.props.className === "bi bi-box").length, 1);
    await options[0].props.onClick();
    assert.equal(clicked, 1);
    assert.equal(visit(render(), (node) => node.props.role === "menu").length, 0);
  } finally { globalThis.window = oldWindow; globalThis.document = oldDocument; }
});

test("drawer event handlers still close on Escape, overlay click, link navigation and path change", () => {
  const slots = []; let cursor = 0; let pathname = "/m/projects"; let closes = 0;
  const listeners = new Map();
  const previousWindow = globalThis.window;
  globalThis.window = { addEventListener: (key, fn) => listeners.set(key, fn), removeEventListener: (key) => listeners.delete(key) };
  const hooks = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === "function" ? initial() : initial; return [slots[i], (value) => { slots[i] = typeof value === "function" ? value(slots[i]) : value; }]; },
    useRef(initial) { const [value] = hooks.useState(() => ({ current: initial })); return value; },
    useMemo(fn) { return fn(); },
    useEffect(fn) { fn(); },
  };
  const { Sidebar } = loader({ react: hooks, "next/navigation": { usePathname: () => pathname } })("packages/ui/src/Sidebar.tsx");
  const visit = (node, predicate) => {
    if (!node || typeof node !== "object") return [];
    const children = React.Children.toArray(node.props?.children);
    return [...(predicate(node) ? [node] : []), ...children.flatMap((child) => visit(child, predicate))];
  };
  const render = () => { cursor = 0; return Sidebar({ items: fixture(), canView: permitted, variant: "drawer", isOpen: true, onClose: () => closes++ }); };
  try {
    const tree = render();
    listeners.get("keydown")({ key: "Escape" });
    assert.equal(closes, 1);
    visit(tree, (node) => node.props.className?.startsWith("sidebarOverlay"))[0].props.onClick();
    assert.equal(closes, 2);
    // Execute the NavTree component and its NavItem child to exercise the actual link handler.
    const nav = visit(tree, (node) => node.props.nodes?.some((item) => item.id === "projects"))[0];
    const navItems = nav.type(nav.props);
    const project = visit(navItems, (node) => node.props.node?.id === "projects")[0];
    const projectTree = project.type(project.props);
    visit(projectTree, (node) => node.type === "a")[0].props.onClick();
    assert.equal(closes, 3);
    pathname = "/m/tasks/1"; render();
    assert.equal(closes, 4);
  } finally { globalThis.window = previousWindow; }
});

test("shell shares selection and storage while permission wrapper retains hasPermiso(slug, ver)", () => {
  const shell = readFileSync("apps/web/app/(main)/MainShell.tsx", "utf8");
  assert.match(shell, /jiro.sidebar.module/);
  assert.equal((shell.match(/moduleSelection=\{moduleSelection\}/g) || []).length, 2);
  assert.equal((shell.match(/onModuleChange=\{selectModule\}/g) || []).length, 2);
  const wrapper = readFileSync("apps/web/app/(main)/SidebarWithPerms.tsx", "utf8");
  assert.match(wrapper, /if \(loading\) return false/);
  assert.match(wrapper, /hasPermiso\(slug, "ver"\)/);
  const layout = readFileSync("apps/web/app/(main)/layout.tsx", "utf8");
  assert.match(layout, /row.activo === true/);
  assert.match(layout, /r.parent_id/);
});

test("layout preserves active rows, parent_id, orden, literal routes and JSON/object icon metadata", async () => {
  const rows = [
    { id: "root", nombre: "Root", slug: "root", tipo: "carpeta", activo: true, props: { ui: { icon: "bi-folder" } } },
    { id: "second", nombre: "Second", slug: "second", tipo: "tabla", activo: true, parent_id: "root", orden: 2, route: "/custom/second", props: { ui: { icon: "bi-box" } } },
    { id: "first", nombre: "First", slug: "first", tipo: "vista", activo: true, parent_id: "root", orden: 1, route: "/custom/first", props: JSON.stringify({ ui: { icon: "bi-grid", sidebar: true } }) },
    { id: "inactive", nombre: "Inactive", slug: "inactive", tipo: "tabla", activo: false, parent_id: "root" },
  ];
  const { default: Layout } = loader({
    "next/font/local": () => ({ variable: "test-font" }),
    "../providers": () => null,
    "./MainShell": () => null,
    "@/lib/modules/resolveModuleConfig": { fetchModuleRows: async () => rows },
  })("apps/web/app/(main)/layout.tsx");
  const element = await Layout({ children: null });
  const items = element.props.children.props.children.props.items;
  assert.equal(items.length, 1);
  assert.deepEqual(items[0].hijos.map((node) => node.id), ["first", "second"]);
  assert.equal(items[0].hijos[0].icon, "bi-grid");
  assert.equal(items[0].hijos[0].sidebar, true);
  assert.equal(items[0].hijos[0].tipo, "vista");
  assert.equal(items[0].hijos[1].route, "/custom/second");
});

test("Mi cuenta reuses ActionMenu in expanded and mini mode and submits the existing native POST", () => {
  const hooks = {
    useState: (initial) => [typeof initial === "function" ? initial() : initial, () => {}],
    useRef: (initial) => ({ current: initial }), useMemo: (fn) => fn(), useEffect: () => {},
  };
  const { Sidebar } = loader({ react: hooks, "next/navigation": { usePathname: () => "/m/projects" } })("packages/ui/src/Sidebar.tsx");
  const visit = (node, predicate) => !node || typeof node !== "object" ? [] : [
    ...(predicate(node) ? [node] : []), ...React.Children.toArray(node.props?.children).flatMap((child) => visit(child, predicate)),
  ];
  for (const miniMode of [false, true]) {
    const tree = Sidebar({ items: fixture(), canView: permitted, miniMode });
    const account = visit(tree, (node) => node.type?.name === "SidebarUser")[0];
    const accountTree = account.type(account.props);
    const menu = visit(accountTree, (node) => node.type?.name === "ActionMenu")[0];
    assert.deepEqual(menu.props.items.map((item) => item.label), ["Mi perfil", "Salir"]);
    assert.equal(menu.props.items[0].disabled, true);
    assert.equal(menu.props.triggerTitle, "Mi cuenta");
    assert.equal(visit(menu.props.trigger, (node) => node.props.className === "bi bi-person-circle fs-5").length, 1);
    assert.equal(visit(menu.props.trigger, (node) => node.type === "span").length, miniMode ? 0 : 1);
    const form = visit(accountTree, (node) => node.type === "form")[0];
    assert.equal(form.props.action, "/api/auth/signout");
    assert.equal(form.props.method, "post");
    assert.equal(form.props.hidden, true);
    let submissions = 0;
    form.props.ref.current = { requestSubmit: () => submissions++ };
    menu.props.items[1].onClick();
    assert.equal(submissions, 1);
  }
});

test("section colors support HEX formats, invalid-color fallback and readable light/dark text", () => {
  const { normalizeHexColor, getFormSectionColors } = load("packages/ui/src/utils/colorContrast.ts");
  assert.deepEqual(getFormSectionColors("#2563eb"), { background: "#2563eb", foreground: "#ffffff" });
  assert.equal(getFormSectionColors("#111111").foreground, "#ffffff");
  assert.equal(getFormSectionColors("#fefefe").foreground, "#000000");
  assert.equal(normalizeHexColor(" #AbC "), "#aabbcc");
  assert.equal(normalizeHexColor("#00000080"), "#7f7f7f");
  assert.equal(normalizeHexColor("#0f08"), "#77ff77");
  assert.equal(normalizeHexColor("#0000"), "#ffffff");
  for (const invalid of [undefined, null, "", "#12", "#gggggg", "red", "url(test)"]) {
    assert.deepEqual(getFormSectionColors(invalid), { background: "#e2e8f0", foreground: "#000000" });
  }
  for (let channel = 0; channel < 256; channel++) {
    const hex = channel.toString(16).padStart(2, "0");
    const { foreground } = getFormSectionColors(`#${hex}${hex}${hex}`);
    const c = channel / 255;
    const luminance = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    const contrast = foreground === "#ffffff" ? 1.05 / (luminance + 0.05) : (luminance + 0.05) / 0.05;
    assert.ok(contrast >= 4.5, `Insufficient contrast for #${hex}${hex}${hex}`);
  }
});

test("lightening shares HEX normalization, clamps amounts and preserves readable action text", () => {
  const { lightenColor, normalizeHexColor, getContrastingTextColor } = load("packages/ui/src/utils/colorContrast.ts");
  assert.equal(lightenColor("#000", 0.5), "#808080");
  assert.equal(lightenColor("#abc", -1), normalizeHexColor("#abc"));
  assert.equal(lightenColor("#123456", 2), "#ffffff");
  assert.equal(lightenColor("#0000"), "#ffffff");
  assert.equal(lightenColor("invalid", 0), normalizeHexColor(null));
  for (const color of ["#172554", "#fff3cd", "#2563eb", "#fff", "#000"]) {
    for (const amount of [0.18, 0.28]) {
      const hex = lightenColor(color, amount);
      const channels = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255)
        .map((c) => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
      const luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
      const contrast = getContrastingTextColor(hex) === "#ffffff" ? 1.05 / (luminance + 0.05) : (luminance + 0.05) / 0.05;
      assert.ok(contrast >= 4.5);
    }
  }
});

test("form headers use schema color through scoped variables; two wrapper levels and list card decoration are removed", () => {
  const form = readFileSync("packages/ui/src/Form.tsx", "utf8");
  assert.match(form, /getFormSectionColors\(normalizedSchema.ui\?\.color\)/);
  assert.match(form, /"--jiro-section-bg": sectionColors.background/);
  assert.match(form, /card-header jiro-form-section-header/);
  const css = readFileSync("apps/web/app/globals.css", "utf8");
  assert.match(css, /\.jiro-record-form \.jiro-form-section-header\s*\{\s*background: var\(--jiro-section-bg/);
  assert.match(css, /\.jiro-record-form \.jiro-form-section-header :is\(\.fw-semibold, \.small, \.text-muted\)/);
  assert.match(css, /\.main-shell-content\s*\{[^}]*margin: 0;[^}]*padding: 8px;/);
  assert.match(css, /\.jiro-list-view,\s*\.jiro-record-form\s*\{\s*width: 100%;/);
  const shell = readFileSync("apps/web/app/(main)/MainShell.tsx", "utf8");
  assert.doesNotMatch(shell, /container-fluid px-0 layout-min-vh/);
  assert.match(shell, /className="main-shell-layout layout-min-vh"/);
  assert.doesNotMatch(shell, /main-shell-content[^"\n]*shadow/);
  for (const suffix of ["page.tsx", "[id]/page.tsx", "new/page.tsx"]) {
    const page = readFileSync(`apps/web/app/(main)/m/[slug]/${suffix}`, "utf8");
    assert.doesNotMatch(page, /<main|className="container/);
    assert.match(page, /return\s*\(\s*<(?:ListPageClient|FormClient)/);
  }
  const list = readFileSync("packages/ui/src/ListView.tsx", "utf8");
  assert.match(list, /className="jiro-list-view d-flex flex-column"/);
  assert.doesNotMatch(list, /className="card jiro-list-view"/);
  assert.match(form, /className="row g-3"/);
  assert.match(form, /key=\{section.id\} className="card"/);
});


test("record breadcrumb uses loaded display values, actual routes, and clears stale navigation", () => {
  let pathname = "/custom/clients/42";
  let value = null;
  let cleanup;
  const context = { get value() { return value; }, setValue: next => { value = typeof next === "function" ? next(value) : next; } };
  const hooks = { ...React, createContext: () => ({}), useContext: () => context, useEffect: effect => { cleanup = effect(); } };
  const { getRecordTitle, RegisterRecordBreadcrumb, RecordBreadcrumbTrail } = loader({ react: hooks, "next/navigation": { usePathname: () => pathname }, "next/link": "a" })("apps/web/lib/RecordBreadcrumb.tsx");
  assert.equal(getRecordTitle({ name: "ACME S.L.", key: 42 }, "name", "key", "Clientes"), "ACME S.L.");
  assert.equal(getRecordTitle({ name: " ", key: 0 }, "name", "key", "Clientes"), "0");
  assert.equal(getRecordTitle({ name: {} }, "name", "key", "Clientes"), "Clientes");
  RegisterRecordBreadcrumb({ module: "Clientes", title: "ACME S.L.", href: "/custom/clients/" });
  const html = renderToStaticMarkup(RecordBreadcrumbTrail());
  assert.ok(html.includes('href="/custom/clients/"'));
  assert.match(html, /ACME S.L./);
  pathname = "/custom/clients";
  assert.equal(RecordBreadcrumbTrail(), null);
  cleanup();
  assert.equal(value, null);
});

test("module palette chooses neutral actions with contrasting text for light and dark modules", () => {
  const { getModuleColorVariables, getContrastingTextColor } = load("packages/ui/src/utils/colorContrast.ts");
  for (const color of ["#172554", "#fff3cd", "#7c3aed"]) {
    const palette = getModuleColorVariables(color);
    assert.equal(palette["--module-color"], color);
    for (const [bg, fg] of [["--module-color", "--module-contrast"], ["--module-color-light", "--module-light-contrast"], ["--module-color-soft", "--module-soft-contrast"], ["--module-action", "--module-action-text"], ["--module-action-hover", "--module-action-text"]]) {
      assert.equal(palette[fg], getContrastingTextColor(palette[bg]));
    }
    const neutral = palette["--module-action"];
    assert.equal(neutral.slice(1, 3), neutral.slice(3, 5));
    assert.equal(neutral.slice(3, 5), neutral.slice(5, 7));
  }
});
