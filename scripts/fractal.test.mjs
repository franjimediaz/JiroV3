import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(resolve('apps/web/package.json'));
function load(file) {
  const code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(id => {
    if (id.startsWith('.')) { const path = resolve(dirname(file), id); return load(path + (existsSync(path + '.ts') ? '.ts' : '.tsx')); }
    return require(id);
  }, module, module.exports);
  return module.exports;
}
const { buildFractalForest, flattenFractal } = load('packages/ui/src/fractalModel.ts');
const { getFractalConfig, validateFractalConfig } = load('packages/types/fractal.ts');
const { serializeModuleSchema } = load('packages/types/serializeModuleSchema.ts');
const schema = { db: { table: 'records', primaryKey: 'key' }, fields: ['key', 'parent', 'name'].map(name => ({ name, type: 'text' })) };
test('legacy defaults and Fractal configuration survive serialization without changing records', () => {
  assert.equal(getFractalConfig(schema).enabled, false);
  const configured = { ...schema, ui: { fractal: { enabled: true, parentField: 'parent', titleField: 'name', visibleFields: ['key'] } } };
  assert.equal(validateFractalConfig(configured), null);
  assert.deepEqual(serializeModuleSchema(configured).ui.fractal, configured.ui.fractal);
  assert.match(validateFractalConfig({ ...configured, ui: { fractal: { ...configured.ui.fractal, parentField: 'key' } } }), /campo padre/);
  assert.match(validateFractalConfig({ ...configured, fields: [] }), /campo padre/);
});
test('forest handles custom keys, zero, missing parents, duplicate IDs and cycles without mutation', () => {
  const rows = [{ key: 0, parent: null }, { key: 1, parent: 0 }, { key: 1, parent: 2 }, { key: 2, parent: 3 }, { key: 3, parent: 2 }, { key: 4, parent: 4 }, { key: 5, parent: 99 }, { name: 'invalid' }];
  const snapshot = structuredClone(rows);
  const forest = buildFractalForest(rows, 'key', 'parent');
  assert.equal(forest.duplicates, 1); assert.equal(forest.cycles, 2); assert.equal(forest.orphans, 1); assert.equal(forest.invalid, 1);
  const visible = flattenFractal(forest, new Set(forest.nodes.keys()), '', []);
  assert.equal(visible.length, 6); assert.equal(new Set(visible.map(item => item.node.id)).size, 6);
  assert.equal(forest.nodes.get('1').parent, '0'); assert.deepEqual(rows, snapshot);
});
test('search includes ancestors, excludes unrelated nodes, and expansion is independent', () => {
  const forest = buildFractalForest([{ id: 'a', name: 'root' }, { id: 'b', parent: 'a', name: 'child' }, { id: 'c', parent: 'b', name: 'needle' }, { id: 'd', name: 'other' }], 'id', 'parent');
  assert.deepEqual(flattenFractal(forest, new Set(), '', ['name']).map(x => x.node.id), ['a', 'd']);
  assert.deepEqual(flattenFractal(forest, new Set(), 'NEEDLE', ['name']).map(x => x.node.id), ['a', 'b', 'c']);
  assert.equal(flattenFractal(forest, new Set(), 'missing', ['name']).length, 0);
});
test('deep hierarchies do not overflow the call stack', () => {
  const rows = Array.from({ length: 20000 }, (_, id) => ({ id, parent: id ? id - 1 : null }));
  const forest = buildFractalForest(rows, 'id', 'parent');
  assert.equal(flattenFractal(forest, new Set(forest.nodes.keys()), '', []).length, rows.length);
});
