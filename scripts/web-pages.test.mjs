import test from 'node:test';
import assert from 'node:assert/strict';
import { createSourceLoader } from './helpers/dashboard-fixtures.mjs';
const fixture=createSourceLoader()('apps/web/app/(main)/system/web-editor/fixture.ts');
function setup({user={user:{id:'actor'},role:{slug:'systemadmin'}},row=null,error=null}={}) {
 const writes=[], audits=[];
 const db={from(table){ assert.equal(table,'web_pages'); let mode='read',values,filters={}; const q={select(){return q},eq(k,v){filters[k]=v;return q},insert(v){mode='insert';values=v;return q},update(v){mode='update';values=v;return q},async maybeSingle(){
 if(error)return {data:null,error};
 if(mode==='read')return {data:row,error:null};
 writes.push({mode,values,filters});
 if(mode==='insert'&&row)return {data:null,error:{code:'23505'}};
 if(mode==='update'&&(!row||row.revision!==filters.revision))return {data:null,error:null};
 row={...row,...values,id:'page-id'};return {data:row,error:null};
 }};return q;}};
 const api=createSourceLoader({"next/cache":{revalidatePath(){}},'@/lib/auth/getCurrentUser':{getCurrentUser:async()=>user},'@/lib/supabase/admin':{supabaseAdmin:db},'@/lib/audit/writeAuditEvent':{writeAuditEvent:async e=>audits.push(e)}})('apps/web/actions/webPages.ts');
 return {api,writes,audits};
}
const input=(revision=null)=>({title:'Página',description:null,puckData:fixture.createEditorExample(),revision});
test('initial missing draft returns null',async()=>assert.equal(await setup().api.getWebPageDraft(),null));
test('existing draft is validated and returned',async()=>{const data=fixture.createEditorExample();const {api}=setup({row:{id:'one',title:'Page',description:null,revision:3,draft_data:data}});assert.deepEqual((await api.getWebPageDraft()).puckData,data);});
test('valid creation uses server actor and revision one',async()=>{const s=setup();const result=await s.api.saveWebPageDraft(input());assert.equal(result.ok,true);assert.equal(result.revision,1);assert.equal(s.writes[0].values.updated_by,'actor');assert.equal(s.writes[0].values.path,'/');assert.equal(s.audits.at(-1).success,true);});
test('invalid JSON rejected without writes',async()=>{const s=setup();assert.equal((await s.api.saveWebPageDraft({...input(),puckData:{}})).code,'VALIDATION');assert.equal(s.writes.length,0);});
for(const user of [null,{user:{id:'x'},role:{slug:'user'}}])test('unauthorized load and save',async()=>{const s=setup({user});await assert.rejects(s.api.getWebPageDraft());assert.equal((await s.api.saveWebPageDraft(input())).code,'FORBIDDEN');assert.equal(s.writes.length,0);});
test('matching revision updates atomically',async()=>{const s=setup({row:{revision:3}});assert.equal((await s.api.saveWebPageDraft(input(3))).revision,4);assert.deepEqual(s.writes[0].filters,{path:'/',revision:3});});
test('stale revision conflicts',async()=>assert.equal((await setup({row:{revision:4}}).api.saveWebPageDraft(input(3))).code,'CONFLICT'));
test('concurrent creation conflicts',async()=>assert.equal((await setup({row:{revision:1}}).api.saveWebPageDraft(input())).code,'CONFLICT'));
test('database errors never masquerade as missing data',async()=>{const s=setup({error:{code:'offline'}});await assert.rejects(s.api.getWebPageDraft());assert.equal((await s.api.saveWebPageDraft(input())).code,'DATABASE');});
test('export and fixture reset do not write to database',()=>{const s=setup();fixture.serializeEditorPage(fixture.createEditorExample());fixture.createEditorExample();assert.equal(s.writes.length,0);});
test('client cannot inject path, actor or id',async()=>{for(const key of ['path','id','updated_by'])assert.equal((await setup().api.saveWebPageDraft({...input(),[key]:'bad'})).code,'VALIDATION');});
