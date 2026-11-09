import test from 'node:test';
import assert from 'node:assert/strict';
import { createSourceLoader } from './helpers/dashboard-fixtures.mjs';
import { parsePublicationManifest, serializePublicationManifest } from '../packages/web-schema/dist/index.js';
const load=createSourceLoader();
const {buildManifest,MAX_PUBLICATION_BYTES}=load('apps/web/lib/web-publication/buildManifest.ts');
const {defaultTheme}=load('apps/web/lib/web-publication/defaultTheme.ts');
const date='2026-11-09T12:00:00.000Z';
const row=(path='/',id='root')=>({id,path,title:'Página '+path,description:null,draft_data:{root:{props:{title:'Página '+path}},content:[]}});
const build=rows=>buildManifest(rows,defaultTheme,'test-publication',date);
test('root manifest, deterministic order, SEO and no input mutation',()=>{
 const root=row();const contact={...row('/contacto','contact'),description:'Descripción SEO'};
 const original=structuredClone([contact,root]);const manifest=build([contact,root]);
 assert.deepEqual(manifest.pages.map(p=>p.path),['/','/contacto']);assert.equal(manifest.pages[1].description,'Descripción SEO');assert.equal('description' in manifest.pages[0],false);
 assert.deepEqual([contact,root],original);assert.deepEqual(build([root,contact]),manifest);assert.equal(manifest.schemaVersion,1);
 assert.equal(build([root]).pages.length,1);
});
test('missing root, invalid paths and normalized duplicates rejected with page context',()=>{
 assert.throws(()=>build([row('/other')]),/raíz/);
 assert.throws(()=>build([row(),row('/api','bad')]),/bad/);
 assert.throws(()=>build([row(),row('/a','one'),row('/a/','two')]),/two.*duplicada/);
});
test('invalid Puck, unknown nested nodes, duplicate IDs and missing props rejected',()=>{
 const badValues=[{}, {root:{props:{}},content:[{type:'Unknown',props:{id:'x'}}]},
 {root:{props:{}},content:[{type:'Heading',props:{id:'x'}}]},
 {root:{props:{}},content:[{type:'Section',props:{id:'section',content:{}}}]},
 {root:{props:{}},content:[{type:'Section',props:{id:'section',content:[{type:'Unknown',props:{id:'nested'}}]}}]},
 {root:{props:{}},content:[{type:'TextBlock',props:{id:'x',text:'A'}},{type:'TextBlock',props:{id:'x',text:'B'}}]}];
 for(const draft_data of badValues)assert.throws(()=>build([{...row(),id:'broken-page',draft_data}]),/broken-page/);
});
test('manifest serialization and renderer parser are lossless',()=>{
 const manifest=build([row(),row('/contacto','contact')]);
 assert.deepEqual(parsePublicationManifest(serializePublicationManifest(manifest)),manifest);
 const reader=createSourceLoader({'node:fs':{readFileSync:()=>serializePublicationManifest(manifest)},react:{cache:fn=>fn}})('apps/web-static/lib/publication.ts');
 assert.deepEqual(reader.getPublication().manifest,manifest);assert.equal(reader.getPublishedPage('/contacto/').page.id,'contact');
});
test('theme, date, and size constraints preserved',()=>{
 assert.throws(()=>buildManifest([row()],defaultTheme,'test','not-a-date'));
 const data=row();data.draft_data.content=[{type:'TextBlock',props:{id:'text',text:'x'.repeat(MAX_PUBLICATION_BYTES)}}];
 assert.throws(()=>build([data]),/1 MiB/);
});
function setup(rows=[],options={}) {
 const calls=[],audits=[];
 const supabaseAdmin={from(table){assert.equal(table,'web_pages');let cursor;
  const query={select(columns){assert.equal(columns,'id,path,title,description,draft_data');return query;},order(column){assert.equal(column,'id');return query;},limit(n){assert.equal(n,100);return query;},gt(column,value){assert.equal(column,'id');cursor=value;return query;},then(resolve,reject){calls.push(cursor);return Promise.resolve(options.error?{data:null,error:{code:'offline'}}:{data:rows.filter(r=>!cursor||r.id>cursor).slice(0,options.cap??100),error:null}).then(resolve,reject);}};return query;
 }};
 const api=createSourceLoader({'@/lib/auth/getCurrentUser':{getCurrentUser:async()=>options.user===undefined?{user:{id:'admin'},role:{slug:'systemadmin'}}:options.user},'@/lib/supabase/admin':{supabaseAdmin},'@/lib/audit/writeAuditEvent':{writeAuditEvent:async event=>audits.push(event)}})('apps/web/actions/webPublication.ts');
 return {api,calls,audits};
}
test('action denies anonymous and non-admin before querying',async()=>{
 for(const user of [null,{user:{id:'u'},role:{slug:'user'}}]){const s=setup([],{user});const result=await s.api.generateWebPublication();assert.equal(result.code,'FORBIDDEN');assert.equal(result.json,null);assert.equal(s.calls.length,0);assert.equal(s.audits[0].success,false);}
});
test('database errors and validation errors are structured; no JSON in audit',async()=>{
 const s=setup([],{error:true});assert.equal((await s.api.generateWebPublication()).code,'DATABASE');
 const invalid=setup([row('/missing')]);assert.equal((await invalid.api.generateWebPublication()).code,'VALIDATION');
 assert.ok(!JSON.stringify(invalid.audits).includes('draft_data'));
});
test('action paginates beyond 1000 rows, accepts smaller API batches, performs no page writes',async()=>{
 const rows=Array.from({length:1001},(_,i)=>row(i===0?'/':'/page-'+i,String(i).padStart(8,'0')));
 const s=setup(rows,{cap:37});const result=await s.api.generateWebPublication();
 assert.equal(result.ok,true);assert.equal(result.pageCount,1001);assert.ok(s.calls.length>27);
 assert.equal(parsePublicationManifest(result.json).pages.length,1001);assert.match(result.publicationId,/^[0-9a-f-]{36}$/);
 assert.equal(s.audits[0].metadata.pageCount,1001);assert.equal(s.audits[0].success,true);assert.ok(!JSON.stringify(s.audits).includes('Página'));
});

test('publication UI downloads only successful JSON and reports page count',async()=>{
 const oldWindow=globalThis.window,oldDocument=globalThis.document;
 let clicked=0,name="",allow=false,index=0;const states=[];
 const hooks={useState(value){const n=index++;if(!(n in states))states[n]=value;return [states[n],next=>states[n]=next];},useRef(value){const n=index++;if(!(n in states))states[n]={current:value};return states[n];}};
 const json=serializePublicationManifest(build([row()]));
 const component=createSourceLoader({react:hooks,"@/actions/webPublication":{generateWebPublication:async()=>allow?{ok:true,json,pageCount:1,message:"Todavía no se ha publicado en GitHub ni Vercel."}:{ok:false,json:null,message:"Falta raíz"}}})("apps/web/app/(main)/system/web-pages/WebPagesClient.tsx").default;
 const walk=node=>!node||typeof node!=="object"?[]:[node,...[node.props?.children].flat(Infinity).flatMap(walk)];
 const render=()=>{index=0;return walk(component({result:{ok:true,data:[]}}));};
 globalThis.window={setTimeout(fn){fn();}};
 globalThis.document={createElement(){return {set download(value){name=value;},click(){clicked++;},remove(){}};},body:{appendChild(){}}};
 try {
  await render().find(n=>n.type==="button").props.onClick();assert.equal(clicked,0);assert.ok(render().some(n=>n.props?.role==="alert"&&n.props.children==="Falta raíz"));
  allow=true;await render().find(n=>n.type==="button").props.onClick();assert.equal(clicked,1);assert.equal(name,"publication.json");assert.ok(render().some(n=>n.props?.role==="status"&&n.props.children.includes("1 páginas incluidas")));
 } finally {globalThis.window=oldWindow;globalThis.document=oldDocument;}
});
