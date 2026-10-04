import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(resolve('apps/web/package.json'));
function loader(overrides = {}) {
  return function load(file) {
    const path = resolve(file), module = { exports: {} };
    const code = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    new Function('require', 'module', 'exports', code)(id => {
      if (id in overrides) return overrides[id];
      if (id === '@repo/types') return load('packages/types/index.ts');
      if (id.startsWith('.') || id.startsWith('@/')) {
        const base = id.startsWith('@/') ? resolve('apps/web', id.slice(2)) : resolve(dirname(path), id);
        if (existsSync(base + '.ts')) return load(base + '.ts');
      }
      return require(id);
    }, module, module.exports);
    return module.exports;
  };
}
const fields = [
  { name: 'parent_id', type: 'selectorTabla', ref: { moduleSlug: 'parents' } },
  { name: 'optional_id', type: 'selectorTabla', ref: { moduleSlug: 'parents' } },
  { name: 'external', type: 'uuid' },
  { name: 'description', type: 'text' },
  { name: 'text_id', type: 'text' },
  { name: 'many', type: 'selectorTabla', ref: { multiple: true } },
];
const { normalizeEmptyRelations } = loader()('packages/types/recordValues.ts');
const parent = '12345678-1234-4234-8234-123456789abc';
const input = { parent_id: parent, optional_id: '', external: '', description: '', text_id: '', many: [] };
const expected = { ...input, optional_id: null, external: null };
const { buildCreateRelatedPayload } = loader()('packages/ui/src/utils/createRelatedPayload.ts');
test('related create always binds the stable parent after defaults and empty editable values', () => {
  const action = { type: 'createRelated', target: { table: 'children' }, defaults: { parent_id: null },
    fieldMap: { parent_id: 'id', optional_id: 'optional_id', description: 'description' } };
  for (const id of [null, '', undefined, 'editable-other-id']) {
    const payload = buildCreateRelatedPayload(action, { db: { primaryKey: 'id' }, fields: [] }, { id, optional_id: null, description: '' }, parent);
    assert.deepEqual(payload, { parent_id: parent, optional_id: null, description: '' });
    assert.equal(normalizeEmptyRelations(fields, payload).parent_id, parent);
  }
  assert.throws(() => buildCreateRelatedPayload(action, { fields: [] }, { id: null }, ''), /Guarda el registro padre/);
});
test('related create uses configured FK and custom primary key in create/edit contexts', () => {
  const action = { type: 'createRelated', target: { table: 'children' }, defaults: { custom_fk: null } };
  const schema = { db: { primaryKey: 'uid' }, fields: [{ type: 'ReverseLink', name: 'children', ref: { moduleSlug: 'children', foreignKey: 'custom_fk' } }] };
  assert.equal(buildCreateRelatedPayload(action, schema, { uid: null }, parent).custom_fk, parent);
  assert.equal(buildCreateRelatedPayload({ ...action, fieldMap: { custom_fk: 'uid' } }, schema, {}, parent).custom_fk, parent);
  assert.throws(() => buildCreateRelatedPayload(action, schema, {}, ''), /Guarda el registro padre/);
  assert.throws(() => buildCreateRelatedPayload(action, { ...schema, fields: [...schema.fields, ...schema.fields] }, {}, parent), /varias relaciones/);
});
test('normalizes declared scalar relations/UUIDs without altering text, arrays, IDs or the input', () => {
  assert.deepEqual(normalizeEmptyRelations(fields, input), expected);
  assert.equal(input.optional_id, '');
  assert.deepEqual(normalizeEmptyRelations(fields, { description: '' }), { description: '' });
  for (const value of [null, undefined, 0, parent, ' ']) assert.equal(normalizeEmptyRelations(fields, { parent_id: value }).parent_id, value);
});
test('dataProvider.create sends nulls for empty relations resolved by physical table', async () => {
  const original = globalThis.fetch;
  let sent;
  globalThis.fetch = async (url, options) => {
    if (url.startsWith('/api/modulos')) return Response.json({ ok: true, data: [{ slug: 'children', props: { db: { table: 'child_records' }, fields } }] });
    assert.equal(url, '/api/create'); sent = JSON.parse(options.body);
    return Response.json({ ok: true, id: parent });
  };
  try {
    const { dataProvider } = loader()('packages/ui/src/providers/DataProvider.ts');
    await dataProvider.create({ table: 'child_records', data: input });
    assert.deepEqual(sent.data, expected);
  } finally { globalThis.fetch = original; }
});
for (const operation of ['create', 'update']) test(`${operation} API normalizes using trusted schema before writing`, async () => {
  let written;
  const query = {
    insert(data) { written = data; return query; }, update(data) { written = data; return query; },
    select() { return query; }, async single() { return { data: { id: parent }, error: null }; },
    async eq() { return { error: null }; },
  };
  const route = loader({
    '@/lib/modules/resolveModuleConfig': { resolveModuleConfig: async () => ({ schema: { fields }, table: 'child_records', slug: 'children', primaryKey: 'id', permissionsKey: 'children' }) },
    '@/lib/auth/requireModulePermission': { requireModulePermission: async () => ({ user: { id: parent }, supabase: { from: () => query } }) },
    '@/lib/audit/shouldAuditEvent': { shouldAuditEvent: () => false },
    '@/lib/audit/writeAuditEvent': { writeAuditEvent: async () => {} },
  })(`apps/web/app/api/${operation}/route.ts`);
  const response = await route.POST(new Request(`http://localhost/api/${operation}`, { method: 'POST', body: JSON.stringify({ moduleSlug: 'children', id: parent, data: input }) }));
  assert.equal(response.status, 200); assert.deepEqual(written, expected);
});
