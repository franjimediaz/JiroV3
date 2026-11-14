import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,verify} from 'node:crypto';
import {createSourceLoader} from './helpers/dashboard-fixtures.mjs';
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const pem=privateKey.export({type:'pkcs8',format:'pem'});
const env={GITHUB_APP_ID:'123',GITHUB_INSTALLATION_ID:'456',GITHUB_APP_PRIVATE_KEY:pem,GITHUB_REPOSITORY_OWNER:'test-owner',GITHUB_REPOSITORY_NAME:'test-repo',GITHUB_PUBLICATION_BRANCH:'release/static'};
const base='apps/web/lib/web-publication/github/';
const loader=createSourceLoader({'server-only':{}});
const {getGithubConfig}=loader(base+'config.ts');
const {createAppJwt,getInstallationToken}=loader(base+'auth.ts');
const {readGithubPublication}=loader(base+'client.ts');
const {comparePublications,imageResourceWarnings}=loader(base+'compare.ts');
const {buildManifest}=loader('apps/web/lib/web-publication/buildManifest.ts');
const {defaultTheme}=loader('apps/web/lib/web-publication/defaultTheme.ts');
function manifest(paths=['/']) {return buildManifest(paths.map((path,i)=>({id:String(i),path,title:path,description:null,draft_data:{root:{props:{title:path}},content:[]}})),defaultTheme,'id','2026-11-14T12:00:00.000Z');}
const config=getGithubConfig(env);
test('valid config, escaped PEM, and invalid configurations',()=>{
 assert.equal(config.repository,'test-repo');assert.equal(getGithubConfig({...env,GITHUB_APP_PRIVATE_KEY:pem.replaceAll('\n','\\n')}).privateKey,pem);
 for(const patch of [{GITHUB_APP_ID:''},{GITHUB_APP_PRIVATE_KEY:'secret-invalid'},{GITHUB_REPOSITORY_OWNER:'bad/owner'},{GITHUB_PUBLICATION_BRANCH:'../main'},{GITHUB_PUBLICATION_BRANCH:'bad branch'}])assert.throws(()=>getGithubConfig({...env,...patch}),error=>error.code==='CONFIG_ERROR'&&!error.message.includes('secret-invalid'));
});
test('JWT is RS256 signed and expires within ten minutes',()=>{
 const jwt=createAppJwt(config,1000);const [header,payload,signature]=jwt.split('.');assert.equal(JSON.parse(Buffer.from(header,'base64url')).alg,'RS256');const claims=JSON.parse(Buffer.from(payload,'base64url'));assert.deepEqual(claims,{iat:940,exp:1540,iss:'123'});assert.ok(verify('RSA-SHA256',Buffer.from(header+'.'+payload),publicKey,Buffer.from(signature,'base64url')));
});
function fakeGithub(options={}) {
 const calls=[];const json=options.json??JSON.stringify(manifest());
 const fetch=async(url,init)=>{
  calls.push({url,init});assert.equal(new URL(url).origin,'https://api.github.com');assert.equal(init.redirect,'error');assert.equal(init.cache,'no-store');
  if(url.includes('/access_tokens')){assert.equal(init.method,'POST');assert.deepEqual(JSON.parse(init.body),{repositories:['test-repo'],permissions:{contents:'read',metadata:'read'}});return Response.json(options.auth?{message:'PRIVATE SECRET'}:{token:'temporary-secret',expires_at:new Date(Date.now()+3600000).toISOString()},{status:options.auth?401:201});}
  assert.equal(init.method,'GET');assert.equal(init.headers.Authorization,'Bearer temporary-secret');
  if(url.endsWith('/test-owner/test-repo'))return Response.json({full_name:'test-owner/test-repo'},{status:options.repository?404:200});
  if(url.includes('/branches/'))return Response.json({name:'release/static',commit:{sha:'a'.repeat(40)}},{status:options.branch?404:200});
  assert.ok(url.endsWith('/apps/web-static/content/publication.json?ref='+'a'.repeat(40)));
  return Response.json({type:'file',path:'apps/web-static/content/publication.json',sha:'b'.repeat(40),size:Buffer.byteLength(json),encoding:'base64',content:Buffer.from(json).toString('base64')},{status:options.missing?404:200});
 };
 return {calls,fetch};
}
async function withFetch(mock,fn){const previous=globalThis.fetch;globalThis.fetch=mock;try{return await fn();}finally{globalThis.fetch=previous;}}
test('authentication error contains no response secrets',async()=>{
 await withFetch(fakeGithub({auth:true}).fetch,()=>assert.rejects(getInstallationToken(config),e=>e.code==='AUTH_ERROR'&&!e.message.includes('SECRET')));
});
test('repository and branch failures are not first publication',async()=>{
 for(const options of [{repository:true},{branch:true}])await withFetch(fakeGithub(options).fetch,()=>assert.rejects(readGithubPublication(config),e=>e.code==='REPOSITORY_ERROR'));
});
test('read-only client returns SHA and UTF-8, and handles absent file',async()=>{
 const mock=fakeGithub();const remote=await withFetch(mock.fetch,()=>readGithubPublication(config));assert.equal(remote.sha,'b'.repeat(40));assert.deepEqual(JSON.parse(remote.json),manifest());assert.equal(mock.calls.length,4);assert.equal(mock.calls.filter(c=>c.init.method!=='GET').length,1);
 assert.equal((await withFetch(fakeGithub({missing:true}).fetch,()=>readGithubPublication(config))).json,null);
});
test('first publication and canonical comparison ignore generation fields and page/key order',()=>{
 const local=manifest(['/','/contacto']);assert.equal(comparePublications(local,null).status,'REMOTE_NOT_FOUND');
 const remote=structuredClone(local);remote.publicationId='another';remote.publishedAt='2026-11-15T12:00:00.000Z';remote.pages.reverse();remote.theme.colors={text:remote.theme.colors.text,primary:remote.theme.colors.primary};const before=structuredClone(remote);
 assert.equal(comparePublications(local,JSON.stringify(remote)).status,'NO_CHANGES');assert.deepEqual(remote,before);
});
test('added, removed, updated paths and theme changes',()=>{
 const local=manifest(['/','/added']),remote=manifest(['/','/removed']);local.pages[0].description='SEO changed';
 const result=comparePublications(local,JSON.stringify(remote));assert.equal(result.status,'CHANGES_DETECTED');assert.deepEqual(result.addedPaths,['/added']);assert.deepEqual(result.removedPaths,['/removed']);assert.deepEqual(result.updatedPaths,['/']);
 const theme=manifest();theme.theme.colors.primary='#123456';assert.equal(comparePublications(theme,JSON.stringify(manifest())).changed,true);
});
test('remote invalid JSON, schema, components and missing root rejected',()=>{
 const remote=manifest();remote.pages[0].puckData.content=[{type:'Unknown',props:{id:'bad'}}];
 for(const json of ['{','{}',JSON.stringify(remote),JSON.stringify({...manifest(),pages:[]})])assert.equal(comparePublications(manifest(),json).status,'REMOTE_INVALID');
});
test('local and HTTPS image references generate warnings without fetching assets',()=>{
 const data=manifest();data.pages[0].puckData.content=[{type:'Section',props:{id:'section',content:[{type:'ImageBlock',props:{id:'image',src:'/photo.jpg',alt:'Photo'}},{type:'Hero',props:{id:'hero',title:'Hero',subtitle:'Text',image:{src:'https://example.test/image.jpg',alt:'Image'}}}]}}];
 const warnings=imageResourceWarnings(data);assert.equal(warnings.length,2);assert.match(warnings[0].message,/apps\/web-static\/public/);assert.match(warnings[1].message,/no descargada/);
});
function actionSetup(options={}) {
 const audits=[],queries=[];const data=manifest();
 const supabaseAdmin={from(table){assert.equal(table,'web_pages');let after=false;const query={select(){return query;},order(){return query;},limit(){return query;},gt(){after=true;return query;},then(resolve,reject){queries.push(table);return Promise.resolve({data:after?[]:data.pages.map(p=>({id:p.id,path:p.path,title:p.title,description:p.description??null,draft_data:p.puckData})),error:null}).then(resolve,reject);}};return query;}};
 const load=createSourceLoader({'server-only':{},'@/lib/auth/getCurrentUser':{getCurrentUser:async()=>options.unauthorized?null:{user:{id:'admin'},role:{slug:'systemadmin'}}},'@/lib/supabase/admin':{supabaseAdmin},'@/lib/audit/writeAuditEvent':{writeAuditEvent:async e=>audits.push(e)},'@/lib/web-publication/github/config':{...loader(base+'config.ts'),getGithubConfig:()=>getGithubConfig(options.badConfig?{}:env)}});
 return {run:load('apps/web/actions/webGithub.ts').checkWebGithubPublication,audits,queries};
}
test('action denies unauthorized users and incomplete config without network',async()=>{
 for(const [options,code] of [[{unauthorized:true},'FORBIDDEN'],[{badConfig:true},'CONFIG_ERROR']]){const s=actionSetup(options);const result=await withFetch(()=>{throw new Error('Unexpected fetch');},s.run);assert.equal(result.code,code);assert.equal(s.queries.length,0);}
});
test('action uses simulated Supabase/GitHub without exposing secrets or full JSON',async()=>{
 const s=actionSetup(),mock=fakeGithub();const result=await withFetch(mock.fetch,s.run);assert.equal(result.code,'NO_CHANGES');assert.equal(result.branch,'release/static');assert.equal(result.comparison.localPageCount,1);
 const output=JSON.stringify({result,audits:s.audits});for(const secret of ['temporary-secret','PRIVATE KEY','puckData','draft_data'])assert.ok(!output.includes(secret));assert.ok(s.queries.length>0);
 const first=await withFetch(fakeGithub({missing:true}).fetch,actionSetup().run);assert.equal(first.ok,true);assert.equal(first.code,'REMOTE_NOT_FOUND');
});
