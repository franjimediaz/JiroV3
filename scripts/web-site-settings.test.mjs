import test from 'node:test';
import assert from 'node:assert/strict';
import { createSourceLoader } from './helpers/dashboard-fixtures.mjs';
import { serializePublicationManifest } from '../packages/web-schema/dist/index.js';

function setup({ user = { role: { slug: 'systemadmin' } }, error = null, stored = null } = {}) {
 const calls = [];
 const query = { select(){return this;}, eq(key,value){assert.equal(key,'id');assert.equal(value,1);return this;},
  upsert(value,options){calls.push(value);assert.equal(options.onConflict,'id');stored=value;return this;},
  async maybeSingle(){return {data:stored,error};}, async single(){return {data:stored,error};} };
 const load = createSourceLoader({'@/lib/auth/getCurrentUser':{getCurrentUser:async()=>user},'@/lib/supabase/admin':{supabaseAdmin:{from(table){assert.equal(table,'web_site_settings');calls.push(table);return query;}}}});
 return { api:load('apps/web/actions/webSiteSettings.ts'), calls };
}
test('global settings persist the singleton and reload the validated Header', async()=>{
 const s=setup();const header={brandText:'Marca',backgroundColor:'#aabbcc',sticky:true,links:[{label:'Inicio',href:'/'}]};
 assert.equal((await s.api.getWebSiteSettings()).header,null);
 assert.deepEqual((await s.api.saveWebSiteSettings(header)).header,header);
 assert.deepEqual((await s.api.getWebSiteSettings()).header,header);
 assert.equal(s.calls.find(v=>typeof v==='object').id,1);
});
test('authorization and invalid URLs or HEX prevent settings access or writes',async()=>{
 for(const user of [null,{role:{slug:'user'}}]){const s=setup({user});assert.equal((await s.api.getWebSiteSettings()).ok,false);assert.equal((await s.api.saveWebSiteSettings({})).ok,false);assert.equal(s.calls.length,0);}
 for(const header of [{color:'red'},{logoSrc:'javascript:alert(1)'},{cta:{label:'X',href:'javascript:alert(1)'}},{tenant_id:1}]){const s=setup();assert.equal((await s.api.saveWebSiteSettings(header)).ok,false);assert.equal(s.calls.length,0);}
});
test('missing table and database failures never masquerade as saved or empty settings',async()=>{
 for(const code of ['42P01','PGRST205','42501']){const s=setup({error:{code}});assert.equal((await s.api.getWebSiteSettings()).ok,false);assert.equal((await s.api.saveWebSiteSettings({})).ok,false);}
});
test('manifest includes Header and static renderer suppresses it for nested page Headers',()=>{
 const load=createSourceLoader();const {buildManifest}=load('apps/web/lib/web-publication/buildManifest.ts');const {defaultTheme}=load('apps/web/lib/web-publication/defaultTheme.ts');
 const row={id:'root',path:'/',title:'Home',description:null,draft_data:{root:{props:{title:'Home'}},content:[]}};
 const header={brandText:'Global'};
 const build=()=>buildManifest([row],defaultTheme,'test','2026-11-21T12:00:00Z',header);
 const reader=manifest=>createSourceLoader({'node:fs':{readFileSync:()=>serializePublicationManifest(manifest)},react:{cache:fn=>fn}})('apps/web-static/lib/publication.ts');
 assert.deepEqual(reader(build()).getPublishedPage('/').header,header);
 row.draft_data.content=[{type:'Section',props:{id:'section',content:[{type:'Header',props:{id:'local',brandText:'Local'}}]}}];
 assert.equal(reader(build()).getPublishedPage('/').header,undefined);
 assert.equal('header' in buildManifest([row],defaultTheme,'test','2026-11-21T12:00:00Z'),false);
});
test('custom color fields reuse Jiro, preserve HEX and visual styles retain their flat JSON shape',()=>{
 const FieldInput=()=>null;
 const {jiroPuckConfig}=createSourceLoader({'@repo/ui':{FieldInput}})('apps/web/app/(main)/system/web-editor/jiroPuckConfig.tsx');
 function all(node){if(!node||typeof node!=='object')return [];return [node,...[node.props?.children].flat(Infinity).flatMap(all)];}
 const fields=jiroPuckConfig.components.Container.fields;
 let saved;
 const color=fields.backgroundColor.render({value:'#abc',onChange:v=>saved=v});
 const picker=all(color).find(n=>n.type===FieldInput);
 assert.equal(picker.props.value,'#aabbcc');picker.props.onChange('#123456');assert.equal(saved,'#123456');picker.props.onChange('red');assert.equal(saved,'#123456');
 assert.equal(jiroPuckConfig.components.Header.fields.color.type,'custom');
 const style=fields.style.render({value:{padding:8,color:'#112233'},onChange:v=>saved=v});
 const padding=all(style).find(n=>n.props?.field?.label==='Padding (px)');padding.props.onChange(16);
 assert.deepEqual(saved,{padding:16,color:'#112233'});
});
