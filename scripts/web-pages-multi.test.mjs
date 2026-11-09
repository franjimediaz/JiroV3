import test from 'node:test';
import assert from 'node:assert/strict';
import { createSourceLoader } from './helpers/dashboard-fixtures.mjs';

const fixture = createSourceLoader()('apps/web/app/(main)/system/web-editor/fixture.ts');
const ROOT = '00000000-0000-4000-8000-000000000001';
const CONTACT = '00000000-0000-4000-8000-000000000002';
function row(id = ROOT, path = '/') {
  const draft_data = fixture.createEditorExample();
  draft_data.root.props.title = path === '/' ? 'Inicio' : 'Contacto';
  return { id, path, title: draft_data.root.props.title, description: 'SEO', revision: 1, updated_at: '2026-01-01T00:00:00Z', draft_data };
}
function setup(initial = [], options = {}) {
  const rows = structuredClone(initial), calls = [], audits = [];
  const db = { from(table) {
    assert.equal(table, 'web_pages');
    let mode = 'read', values, columns, filters = {};
    const query = {
      select(value) { columns = value; return query; },
      eq(key, value) { filters[key] = value; return query; },
      insert(value) { mode = 'insert'; values = value; return query; },
      update(value) { mode = 'update'; values = value; return query; },
      order() { return execute(true); },
      single() { return execute(false); },
      maybeSingle() { return execute(false); },
    };
    async function execute(multiple) {
      calls.push({ mode, values, columns, filters });
      if (options.error) return { data: null, error: { code: 'offline' } };
      if (mode === 'update' && options.race) { rows.find(r => r.id === filters.id).revision++; options.race = false; }
      let selected = rows.filter(row => Object.entries(filters).every(([k, v]) => row[k] === v));
      if (mode === 'insert') {
        if (rows.some(r => r.path === values.path)) return { data: null, error: { code: '23505' } };
        const item = { id: CONTACT, updated_at: '2026-01-02T00:00:00Z', ...structuredClone(values) };
        rows.push(item); selected = [item];
      }
      if (mode === 'update') {
        if (values.path && rows.some(r => r.id !== filters.id && r.path === values.path)) return { data: null, error: { code: '23505' } };
        for (const item of selected) Object.assign(item, structuredClone(values));
      }
      const projected = selected.map(row => Object.fromEntries(columns.split(',').map(key => [key, structuredClone(row[key])])));
      return { data: multiple ? projected : projected[0] ?? null, error: null };
    }
    return query;
  } };
  const load = createSourceLoader({
    "next/cache": { revalidatePath() {} },
    '@/lib/auth/getCurrentUser': { getCurrentUser: async () => options.user === undefined ? { user: { id: 'actor' }, role: { slug: 'systemadmin' } } : options.user },
    '@/lib/supabase/admin': { supabaseAdmin: db },
    '@/lib/audit/writeAuditEvent': { writeAuditEvent: async event => audits.push(event) },
  });
  return { api: load('apps/web/actions/webPages.ts'), rows, calls, audits };
}
test('empty list excludes draft selection', async () => {
  const s = setup(); assert.deepEqual((await s.api.listWebPages()).data, []);
  assert.ok(!s.calls[0].columns.includes('draft_data'));
});
test('multiple pages sorted root first without draft payloads', async () => {
  const s = setup([row(CONTACT, '/contacto'), row()]); const result = await s.api.listWebPages();
  assert.deepEqual(result.data.map(p => p.path), ['/', '/contacto']);
  assert.ok(result.data.every(p => !('draft_data' in p) && !('puckData' in p)));
});
test('creation normalizes path, initializes title and uses authenticated actor', async () => {
  const s = setup(); const result = await s.api.createWebPage({ path: ' /contacto/ ', title: 'Contacto', description: 'SEO' });
  assert.equal(result.ok, true); assert.equal(result.data.id, CONTACT);
  assert.equal(s.rows[0].path, '/contacto'); assert.equal(s.rows[0].revision, 1);
  assert.equal(s.rows[0].draft_data.root.props.title, 'Contacto'); assert.equal(s.rows[0].updated_by, 'actor');
});
test('duplicate and reserved paths rejected', async () => {
  const s = setup([row()]);
  assert.equal((await s.api.createWebPage({path:'/',title:'Duplicate'})).code, 'DUPLICATE');
  for (const path of ['/api/test','/_next','/../bad','https://example.test']) assert.equal((await s.api.createWebPage({path,title:'Bad'})).code,'VALIDATION');
  assert.equal(s.rows.length, 1);
});
test('root may be created when absent', async () => assert.equal((await setup().api.createWebPage({path:'/',title:'Inicio'})).ok,true));
test('lookup validates UUID and distinguishes missing/database failures', async () => {
  const s=setup([row(CONTACT,'/contacto')]);
  assert.equal((await s.api.getWebPageById(CONTACT)).data.path,'/contacto');
  assert.equal((await s.api.getWebPageById('invalid')).code,'VALIDATION');
  assert.equal((await s.api.getWebPageById(ROOT)).code,'NOT_FOUND');
  assert.equal((await setup([], {error:true}).api.getWebPageById(ROOT)).code,'DATABASE');
});
test('metadata change synchronizes root title and preserves other content', async () => {
  const s=setup([row(),row(CONTACT,'/contacto')]);const original=structuredClone(s.rows[1].draft_data.content);
  const result=await s.api.updateWebPageMetadata({id:CONTACT,revision:1,path:'/ayuda/',title:'Ayuda',description:'Nueva SEO'});
  assert.equal(result.data.revision,2); assert.equal(s.rows[1].path,'/ayuda');
  assert.equal(s.rows[1].draft_data.root.props.title,'Ayuda');assert.deepEqual(s.rows[1].draft_data.content,original);
  assert.deepEqual(s.rows[0],row());
});
test('metadata conflicts before update and during atomic update', async () => {
  for(const race of [false,true]) {
    const s=setup([row()],{race});
    const result=await s.api.updateWebPageMetadata({id:ROOT,revision:race?1:2,path:'/',title:'Changed',description:null});
    assert.equal(result.code,'CONFLICT');assert.equal(s.rows[0].title,'Inicio');
  }
});
test('metadata duplicate path preserves original page',async()=>{
 const s=setup([row(),row(CONTACT,'/contacto')]);
 assert.equal((await s.api.updateWebPageMetadata({id:CONTACT,revision:1,path:'/',title:'Changed'})).code,'DUPLICATE');
 assert.equal(s.rows[1].path,'/contacto');
});
test('save non-root by ID preserves path, SEO, and other pages',async()=>{
 const s=setup([row(),row(CONTACT,'/contacto')]);const puckData=fixture.createEditorExample();puckData.root.props.title='Editado';
 const result=await s.api.saveWebPageDraftById({id:CONTACT,revision:1,puckData});
 assert.equal(result.data.revision,2);assert.equal(s.rows[1].title,'Editado');assert.equal(s.rows[1].path,'/contacto');assert.equal(s.rows[1].description,'SEO');assert.deepEqual(s.rows[0],row());
 assert.deepEqual(s.calls.find(call=>call.mode==="update").filters,{id:CONTACT,revision:1});
 assert.equal((await s.api.getWebPageById(CONTACT)).data.puckData.root.props.title,'Editado');
 assert.equal((await s.api.saveWebPageDraftById({id:CONTACT,revision:1,puckData})).code,'CONFLICT');
});
test('malformed Puck, injected actor, invalid revision and blank title cannot write',async()=>{
 const s=setup([row()]);
 for(const value of [{id:ROOT,revision:1,puckData:{}},{id:ROOT,revision:0,puckData:fixture.createEditorExample()},{id:ROOT,revision:1,puckData:fixture.createEditorExample(),updated_by:'attacker'}]) assert.equal((await s.api.saveWebPageDraftById(value)).code,'VALIDATION');
 assert.equal((await s.api.createWebPage({path:'/valid',title:'  '})).code,'VALIDATION');
 assert.equal(s.calls.length,0);
});
test('all new actions authorize before database access and audit failures',async()=>{
 for(const user of [null,{user:{id:'other'},role:{slug:'user'}}]) {
  const s=setup([],{user});
  for(const name of ['listWebPages','createWebPage','getWebPageById','updateWebPageMetadata','saveWebPageDraftById']) assert.equal((await s.api[name]({})).code,'FORBIDDEN');
  assert.equal(s.calls.length,0);assert.ok(s.audits.every(e=>!e.success));
 }
});
test('audit metadata never includes Puck content',async()=>{
 const s=setup();await s.api.createWebPage({path:'/',title:'Secret title'});
 assert.ok(s.audits.some(e=>e.success));assert.ok(!JSON.stringify(s.audits).includes('Secret title'));
});
test('optional undefined values produce identical normalized editor snapshots',()=>{
 const data=fixture.createEditorExample();const before=fixture.serializeEditorPage(data);data.content[0].props.image=undefined;data.content[0].readOnly=undefined;
 assert.equal(fixture.serializeEditorPage(data),before);
});

test('saving validates real stored route and SEO before atomic update',async()=>{
 for(const override of [{path:"/api/private"},{description:123}]) {
  const s=setup([{...row(CONTACT,"/contacto"),...override}]);
  const result=await s.api.saveWebPageDraftById({id:CONTACT,revision:1,puckData:fixture.createEditorExample()});
  assert.equal(result.code,"VALIDATION");assert.equal(s.calls.some(call=>call.mode==="update"),false);
 }
 const s=setup([row(CONTACT,"/contacto")],{race:true});
 assert.equal((await s.api.saveWebPageDraftById({id:CONTACT,revision:1,puckData:fixture.createEditorExample()})).code,"CONFLICT");
 assert.equal(s.rows[0].title,"Contacto");
});
