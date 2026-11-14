import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { createSourceLoader } from "./helpers/dashboard-fixtures.mjs";
import { serializePublicationManifest } from "../packages/web-schema/dist/index.js";

const {privateKey}=generateKeyPairSync("rsa",{modulusLength:2048});
const pem=privateKey.export({type:"pkcs8",format:"pem"});
const env={GITHUB_APP_ID:"123",GITHUB_INSTALLATION_ID:"456",GITHUB_APP_PRIVATE_KEY:pem,GITHUB_REPOSITORY_OWNER:"test-owner",GITHUB_REPOSITORY_NAME:"test-repo",GITHUB_PUBLICATION_BRANCH:"release/static",WEB_PUBLICATION_PREPARATION_SECRET:"preparation-secret-with-at-least-32-bytes"};
const base="apps/web/lib/web-publication/github/";
const loader=createSourceLoader({"server-only":{}});
const {getGithubConfig,GithubError}=loader(base+"config.ts");
const {writeGithubPublication}=loader(base+"client.ts");
const {createPreparation,verifyPreparation}=loader(base+"preparation.ts");
const {buildManifest}=loader("apps/web/lib/web-publication/buildManifest.ts");
const {defaultTheme}=loader("apps/web/lib/web-publication/defaultTheme.ts");
const config=getGithubConfig(env);
function manifest(title="Inicio"){return buildManifest([{id:"root",path:"/",title,description:null,draft_data:{root:{props:{title}},content:[]}}],defaultTheme,"publication-"+title,"2026-11-14T12:00:00.000Z");}
async function withFetch(mock,fn){const previous=globalThis.fetch;globalThis.fetch=mock;try{return await fn();}finally{globalThis.fetch=previous;}}
function writeFetch(status=200) {
  const calls=[];
  const fetch=async(url,init)=>{
    calls.push({url,init});
    if(url.includes("/access_tokens")){assert.equal(init.method,"POST");assert.deepEqual(JSON.parse(init.body).permissions,{contents:"write",metadata:"read"});return Response.json({token:"temporary-write-token",expires_at:new Date(Date.now()+3600000).toISOString()},{status:201});}
    assert.equal(init.method,"PUT");assert.equal(url,"https://api.github.com/repos/test-owner/test-repo/contents/apps/web-static/content/publication.json");assert.equal(init.headers.Authorization,"Bearer temporary-write-token");
    if(status!==200&&status!==201)return Response.json({message:"sensitive upstream detail"},{status});
    const sha="c".repeat(40);return Response.json({commit:{sha,html_url:"https://github.com/test-owner/test-repo/commit/"+sha}},{status});
  };
  return {calls,fetch};
}
test("preparation token is signed, short-lived, tamper-proof and config-bound",()=>{
  const token=createPreparation(manifest(),null,config,1000,env);const verified=verifyPreparation(token,config,1100,env);assert.equal(verified.remoteSha,null);assert.equal(verified.pageCount,1);
  assert.throws(()=>verifyPreparation(token.slice(0,-1)+(token.endsWith("A")?"B":"A"),config,1100,env),e=>e.code==="PREPARATION_INVALID");
  assert.throws(()=>verifyPreparation(token,config,1301,env),e=>e.code==="PREPARATION_EXPIRED");
  assert.throws(()=>verifyPreparation(token,{...config,branch:"other"},1100,env),e=>e.code==="PREPARATION_INVALID");
});
test("write client creates or updates only the configured publication path",async()=>{
  for(const currentSha of [null,"b".repeat(40)]){const mock=writeFetch(currentSha?200:201);const result=await withFetch(mock.fetch,()=>writeGithubPublication(config,"{}",currentSha));assert.equal(result.commitSha,"c".repeat(40));assert.equal(mock.calls.filter(c=>c.init.method==="PUT").length,1);const body=JSON.parse(mock.calls[1].init.body);assert.equal(body.branch,"release/static");assert.equal(Buffer.from(body.content,"base64").toString(),"{}");assert.equal(body.sha,currentSha??undefined);}
});
test("write client does not retry conflicts, permission errors, or network failures",async()=>{
  for(const [status,code] of [[409,"CONFLICT"],[422,"CONFLICT"],[403,"WRITE_PERMISSION_ERROR"]]){const mock=writeFetch(status);await withFetch(mock.fetch,()=>assert.rejects(writeGithubPublication(config,"{}",null),e=>e.code===code&&!e.message.includes("sensitive")));assert.equal(mock.calls.filter(c=>c.init.method==="PUT").length,1);}
  let puts=0;await withFetch(async(url)=>{if(url.includes("/access_tokens"))return Response.json({token:"token",expires_at:new Date(Date.now()+3600000).toISOString()},{status:201});puts++;throw new Error("offline");},()=>assert.rejects(writeGithubPublication(config,"{}",null),e=>e.code==="NETWORK_ERROR"));assert.equal(puts,1);
});
function actionHarness({unauthorized=false,remoteJson=null,remoteSha=null}={}) {
  let local=manifest(),invalid=false,sha=remoteSha,json=remoteJson;const writes=[],audits=[];
  const github={readGithubPublication:async()=>({sha,json,branch:config.branch}),writeGithubPublication:async(_config,next,currentSha)=>{writes.push({next,currentSha});return {commitSha:"d".repeat(40),commitUrl:"https://github.com/test-owner/test-repo/commit/"+"d".repeat(40)};}};
  const load=createSourceLoader({"server-only":{},"@/lib/auth/getCurrentUser":{getCurrentUser:async()=>unauthorized?null:{user:{id:"admin"},role:{slug:"systemadmin"}}},"@/lib/audit/writeAuditEvent":{writeAuditEvent:async event=>audits.push(event)},"./webPublication":{generateWebPublication:async()=>invalid?{ok:true,code:"OK",json:"{}",publicationId:"invalid",pageCount:0}:{ok:true,code:"OK",json:serializePublicationManifest(local),publicationId:local.publicationId,pageCount:local.pages.length}},"@/lib/web-publication/github/config":{...loader(base+"config.ts"),getGithubConfig:()=>config},"@/lib/web-publication/github/client":github});
  const api=load("apps/web/actions/webGithub.ts");
  return {api,writes,audits,setLocal(value){local=value;},setInvalid(){invalid=true;},setRemote(value,nextSha=sha){json=value;sha=nextSha;},failWrite(code){github.writeGithubPublication=async()=>{throw new GithubError(code,"safe error");};}};
}
async function withSecret(fn){const previous=process.env.WEB_PUBLICATION_PREPARATION_SECRET;process.env.WEB_PUBLICATION_PREPARATION_SECRET=env.WEB_PUBLICATION_PREPARATION_SECRET;try{return await fn();}finally{process.env.WEB_PUBLICATION_PREPARATION_SECRET=previous;}}
async function prepare(h){return withSecret(()=>h.api.prepareWebPublication());}
async function publish(h,token){return withSecret(()=>h.api.publishWebPublication({preparationToken:token}));}
test("first publication and existing update require preparation then exactly one write",async()=>{
  for(const initial of [{remoteJson:null,remoteSha:null},{remoteJson:serializePublicationManifest(manifest("Anterior")),remoteSha:"a".repeat(40)}]){const h=actionHarness(initial);const ready=await prepare(h);assert.equal(ready.code,"READY");assert.equal(h.writes.length,0);const result=await publish(h,ready.preparationToken);assert.equal(result.code,"COMMITTED");assert.equal(h.writes.length,1);assert.equal(h.writes[0].currentSha,initial.remoteSha);}
});
test("no changes creates no token or commit",async()=>{const current=manifest();const h=actionHarness({remoteJson:serializePublicationManifest(current),remoteSha:"a".repeat(40)});h.setLocal(current);const result=await prepare(h);assert.equal(result.code,"NO_CHANGES");assert.equal(result.preparationToken,null);assert.equal(h.writes.length,0);});
test("authorization is revalidated for prepare and publish",async()=>{const h=actionHarness({unauthorized:true});assert.equal((await prepare(h)).code,"FORBIDDEN");assert.equal((await publish(h,"bad")).code,"FORBIDDEN");assert.equal(h.writes.length,0);});
test("tampered, expired, changed local, and changed remote preparations never write",async()=>{
  const h=actionHarness();const ready=await prepare(h);
  assert.equal((await publish(h,ready.preparationToken+"x")).code,"PREPARATION_INVALID");
  const expired=createPreparation(manifest(),null,config,Math.floor(Date.now()/1000)-400,env);assert.equal((await publish(h,expired)).code,"PREPARATION_EXPIRED");
  h.setLocal(manifest("Cambiado"));assert.equal((await publish(h,ready.preparationToken)).code,"LOCAL_CHANGED");
  h.setLocal(manifest());h.setRemote(null,"e".repeat(40));assert.equal((await publish(h,ready.preparationToken)).code,"REMOTE_CHANGED");assert.equal(h.writes.length,0);
});
test("remote becoming equal after preparation returns no changes without write",async()=>{const h=actionHarness();const ready=await prepare(h);h.setRemote(serializePublicationManifest(manifest()),null);const result=await publish(h,ready.preparationToken);assert.equal(result.code,"NO_CHANGES");assert.equal(h.writes.length,0);});
test("write failures are structured and audited without secrets",async()=>{for(const code of ["CONFLICT","WRITE_PERMISSION_ERROR","NETWORK_ERROR"]){const h=actionHarness();const ready=await prepare(h);h.failWrite(code);const result=await publish(h,ready.preparationToken);assert.equal(result.code,code);const output=JSON.stringify({result,audits:h.audits});for(const secret of ["preparation-secret","PRIVATE KEY","puckData","draft_data"])assert.ok(!output.includes(secret));}});
test("invalid local manifest and cancellation perform no write",async()=>{const h=actionHarness();h.setInvalid();assert.equal((await prepare(h)).code,"LOCAL_ERROR");assert.equal(h.writes.length,0);const cancelled=actionHarness();await prepare(cancelled);assert.equal(cancelled.writes.length,0);});
function uiHarness(noChanges=false) {
  let index=0,prepareCalls=0,publishCalls=0;const slots=[];
  const hooks={useState(initial){const n=index++;if(!(n in slots))slots[n]=initial;return [slots[n],value=>{slots[n]=typeof value==="function"?value(slots[n]):value;}];},useRef(initial){const n=index++;if(!(n in slots))slots[n]={current:initial};return slots[n];}};
  const comparison={localPageCount:1,remotePageCount:noChanges?1:0,addedPaths:noChanges?[]:["/"],updatedPaths:[],removedPaths:[],changed:!noChanges,status:noChanges?"NO_CHANGES":"REMOTE_NOT_FOUND"};
  const prepareResult={ok:true,code:noChanges?"NO_CHANGES":"READY",message:noChanges?"La web ya está actualizada.":"Preparación lista.",branch:"release/static",comparison,warnings:[],preparationToken:noChanges?null:"signed-token",publicationId:"pub",pageCount:1};
  const github={checkWebGithubPublication:async()=>{throw new Error("unexpected");},prepareWebPublication:async()=>{prepareCalls++;return prepareResult;},publishWebPublication:async input=>{publishCalls++;assert.deepEqual(input,{preparationToken:"signed-token"});return {ok:true,code:"COMMITTED",message:"Commit creado.",publicationId:"pub",pageCount:1,commitSha:"d".repeat(40),commitUrl:"https://github.com/test-owner/test-repo/commit/"+"d".repeat(40)};}};
  const component=createSourceLoader({react:hooks,"@/actions/webGithub":github,"@/actions/webPublication":{generateWebPublication:async()=>{throw new Error("unexpected");}}})("apps/web/app/(main)/system/web-pages/WebPagesClient.tsx").default;
  const walk=node=>!node||typeof node!=="object"?[]:[node,...[node.props?.children].flat(Infinity).flatMap(walk)];
  const render=()=>{index=0;return walk(component({result:{ok:true,data:[]}}));};
  const button=(name)=>render().find(node=>node.type==="button"&&node.props.children===name);
  return {render,button,get prepareCalls(){return prepareCalls;},get publishCalls(){return publishCalls;}};
}
test("publication UI requires explicit confirmation and cancellation performs no write",async()=>{
  const ui=uiHarness();await ui.button("Publicar web").props.onClick();assert.equal(ui.prepareCalls,1);assert.equal(ui.publishCalls,0);assert.ok(ui.button("Confirmar publicación"));ui.button("Cancelar").props.onClick();assert.equal(ui.publishCalls,0);assert.equal(ui.button("Confirmar publicación"),undefined);
  await ui.button("Publicar web").props.onClick();await ui.button("Confirmar publicación").props.onClick();assert.equal(ui.publishCalls,1);assert.ok(ui.render().some(node=>node.type==="a"&&String(node.props.href).includes("/commit/")));
});
test("publication UI reports no changes without offering confirmation",async()=>{const ui=uiHarness(true);await ui.button("Publicar web").props.onClick();assert.equal(ui.publishCalls,0);assert.equal(ui.button("Confirmar publicación"),undefined);assert.ok(ui.render().some(node=>node.props?.children==="La web ya está actualizada."));});
