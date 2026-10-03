// Browser regression check using real UI components and an in-memory data provider.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {createRequire} = require('node:module');
const ts = require('typescript');
const {chromium} = require('playwright');
const appRequire = createRequire(path.resolve('apps/web/package.json'));
const modules = new Map();
const styles = [];
function add(id, source, filename = path.resolve('ui-fixture.tsx')) {
  modules.set(id, '');
  let code = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true}}).outputText;
  code = code.replace(/require\(["']([^"']+)["']\)/g, (_, name) => `require(${JSON.stringify(dependency(name, filename))})`);
  modules.set(id, code); return id;
}
function build(file) {
  file = path.resolve(file); if (modules.has(file)) return file;
  if (file.endsWith('.css')) {
    const mapping = {};
    const css = fs.readFileSync(file, 'utf8').replace(/:global\(([^)]+)\)/g, '$1').replace(/\.([a-zA-Z][\w-]*)/g, (match, name) => {
      if (name.startsWith('btn-')) return match;
      mapping[name] = `qa_${name}`; return `.${mapping[name]}`;
    });
    styles.push(css); modules.set(file, `module.exports=${JSON.stringify(mapping)}`); return file;
  }
  return add(file, fs.readFileSync(file, 'utf8'), file);
}
function dependency(name, filename) {
  if (name === '@repo/types') return build('packages/types/index.ts');
  if (name === '@repo/ui') {
    if (!modules.has('ui')) add('ui', `export {AdvancedFilterBuilder} from './packages/ui/src/AdvancedFilterBuilder';
      export {FilterExpressionSummary} from './packages/ui/src/FilterExpressionSummary';
      export {default as ModalConfirm} from './packages/ui/src/modals/ModalConfirm';
      export {getModuleColorVariables} from './packages/ui/src/utils/colorContrast';
      export const dataProvider={list:(input)=>window.provider.list(input)};`);
    return 'ui';
  }
  if (name.endsWith('/perms')) { modules.set('perms', 'exports.usePerms=()=>({hasPermiso:()=>true});'); return 'perms'; }
  if (name.endsWith('/Selector')) { modules.set('selector', 'module.exports=()=>null;'); return 'selector'; }
  if (name.endsWith('/providers/DataProvider')) { modules.set('provider', 'exports.dataProvider={};'); return 'provider'; }
  if (name.startsWith('.')) {
    const base = path.resolve(path.dirname(filename), name);
    for (const suffix of ['', '.ts', '.tsx', '.js']) if (fs.existsSync(base + suffix) && fs.statSync(base + suffix).isFile()) return build(base + suffix);
  }
  try { return build(createRequire(filename).resolve(name)); }
  catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error; return build(appRequire.resolve(name)); }
}
add('entry', `import React from 'react'; import {createRoot} from 'react-dom/client';
  import {AdvancedSearchView} from './apps/web/lib/AdvancedSearchView';
  import ListView from './packages/ui/src/ListView';
  const schema={db:{table:'projects',name:'Proyectos'},ui:{color:'#235685'},fields:[
    {name:'name',label:'Nombre',type:'text',filter:true},
    {name:'client_id',label:'Cliente',type:'selectorTabla',filter:true,visible:false,ref:{moduleSlug:'clients',displayField:'name'}}]};
  const related={clients:{schema:{db:{table:'clients'},fields:[{name:'name',label:'Nombre cliente',type:'text',filter:true}]}}};
  window.calls=[]; window.provider={list:async input=>{window.calls.push(input); return {data:[{id:1,name:'Resultado'}],count:1};}};
  createRoot(document.getElementById('root')).render(<AdvancedSearchView schema={schema} moduleSlug='projects' modulesBySlug={related} revision={0}>
    {result=><ListView schema={schema} {...result} toolbar={{create:false,search:false}}/>}
  </AdvancedSearchView>);`);
const bundle = `(function(){var process={env:{NODE_ENV:'development'}};var modules={${[...modules].map(([id, code]) => `${JSON.stringify(id)}:function(require,module,exports){\n${code}\n}`).join(',')}};var cache={};function require(id){if(cache[id])return cache[id].exports;var m=cache[id]={exports:{}};modules[id](require,m,m.exports);return m.exports;}require('entry');})();`;
(async () => {
  const browser = await chromium.launch({channel:'msedge',headless:true});
  try {
    const page = await browser.newPage({viewport:{width:1280,height:900}});
    const errors=[]; page.on('pageerror', error=>errors.push(error.message));
    await page.route('http://jiro.test/**',route=>route.fulfill({contentType:'text/html',body:'<div id="root" class="main-shell-content"></div>'}));
    await page.goto('http://jiro.test/m/projects?view=search');
    await page.addStyleTag({content:fs.readFileSync(require.resolve('bootstrap/dist/css/bootstrap.min.css'),'utf8')+'\n'+fs.readFileSync('apps/web/app/globals.css','utf8')+'\n'+styles.join('\n')});
    const iconRequire=createRequire(path.resolve('packages/ui/package.json'));
    await page.route('**/*.woff2*',route=>route.fulfill({contentType:'font/woff2',body:fs.readFileSync(iconRequire.resolve('bootstrap-icons/font/fonts/bootstrap-icons.woff2'))}));
    await page.addStyleTag({content:fs.readFileSync(iconRequire.resolve('bootstrap-icons/font/bootstrap-icons.css'),'utf8')});
    await page.addScriptTag({content:bundle});
    const calls=()=>page.evaluate(()=>window.calls.length);
    assert.equal(await page.getByLabel('Campo del filtro').count(),0);
    await page.getByRole('button',{name:'Crear consulta',exact:true}).click();
    await page.getByRole('button',{name:'+ Condición',exact:true}).click();
    await page.getByLabel('Valor del filtro').fill('ACME');
    await page.getByRole('button',{name:'Aplicar',exact:true}).click();
    assert.equal(await calls(),0);
    assert.ok(page.url().includes('filters='));
    assert.match(await page.locator('.jiro-query-card').innerText(),/ACME/);
    assert.equal(await page.getByLabel('Campo del filtro').count(),0);
    const savedUrl=page.url();
    for (const exit of ['cancel','escape','close','overlay']) {
      await page.getByRole('button',{name:'Editar consulta',exact:true}).click();
      assert.equal(await page.getByLabel('Valor del filtro').inputValue(),'ACME');
      await page.getByLabel('Valor del filtro').fill('DISCARD');
      if (exit==='cancel') await page.getByRole('button',{name:'Cancelar',exact:true}).click();
      if (exit==='escape') await page.keyboard.press('Escape');
      if (exit==='close') await page.getByRole('button',{name:'Cerrar',exact:true}).click();
      if (exit==='overlay') await page.locator('.qa_backdrop').click({position:{x:2,y:2}});
      assert.equal(await page.getByRole('dialog').count(),0);
      assert.equal(await page.evaluate(()=>document.activeElement.textContent),'Editar consulta');
      assert.equal(page.url(),savedUrl);
      assert.doesNotMatch(await page.locator('.jiro-query-card').innerText(),/DISCARD/);
    }
    await page.getByRole('button',{name:'Editar consulta',exact:true}).click();
    await page.getByRole('button',{name:'+ Grupo',exact:true}).click();
    await page.getByLabel('Lógica del grupo').nth(1).selectOption('OR');
    await page.getByRole('button',{name:'+ Condición',exact:true}).first().click();
    await page.getByLabel('Campo del filtro').nth(1).selectOption(JSON.stringify(['client_id','name']));
    await page.getByLabel('Valor del filtro').nth(1).fill('Madrid');
    assert.equal(await page.locator('.qa_header').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(35, 86, 133)');
    await page.getByRole('button',{name:'Aplicar',exact:true}).click();
    assert.equal(await calls(),0);
    assert.match(await page.locator('.jiro-query-card').innerText(),/CUALQUIERA · OR/);
    assert.match(await page.locator('.jiro-query-card').innerText(),/Cliente > Nombre cliente/);
    await page.getByRole('button',{name:'Buscar',exact:true}).click();
    await page.getByRole('cell',{name:'Resultado',exact:true}).waitFor();
    assert.equal(await calls(),1);
    fs.mkdirSync('.tmp',{recursive:true});
    await page.screenshot({path:'.tmp/advanced-search-summary.png'});
    await page.setViewportSize({width:390,height:844});
    await page.getByRole('button',{name:'Editar consulta',exact:true}).click();
    await page.getByLabel('Valor del filtro').first().fill('NUEVA');
    for(let i=0;i<5;i++) await page.getByRole('button',{name:'+ Condición',exact:true}).last().click();
    assert.ok(await page.locator('.qa_body').evaluate(el=>el.scrollHeight>el.clientHeight));
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:'.tmp/advanced-search-modal-mobile.png'});
    await page.getByRole('button',{name:'Aplicar',exact:true}).click();
    assert.equal(await calls(),1);
    assert.equal(await page.evaluate(()=>window.calls[0].advancedFilters.items[0].value),'ACME');
    assert.match(await page.locator('.jiro-query-card').innerText(),/NUEVA/);
    await page.reload(); await page.addScriptTag({content:bundle});
    await page.getByRole('button',{name:'Editar consulta',exact:true}).waitFor();
    assert.equal(await calls(),0);
    assert.match(await page.locator('.jiro-query-card').innerText(),/NUEVA/);
    assert.deepEqual(errors,[]);
    console.log('PASS modal draft/apply/cancel/Escape/close/overlay, summary, URL restore, explicit search, palette, mobile scroll.');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
