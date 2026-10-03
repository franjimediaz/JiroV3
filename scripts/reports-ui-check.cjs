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
    if (!modules.has('ui')) add('ui', `export {default as ListView} from './packages/ui/src/ListView'; export {AdvancedFilterBuilder} from './packages/ui/src/AdvancedFilterBuilder';
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
  import ReportsClient from './apps/web/lib/reports/ReportsClient';
  createRoot(document.getElementById('root')).render(<ReportsClient/>);`);
const bundle = `(function(){var process={env:{NODE_ENV:'development'}};var modules={${[...modules].map(([id, code])=>`${JSON.stringify(id)}:function(require,module,exports){\n${code}\n}`).join(',')}};var cache={};function require(id){if(cache[id])return cache[id].exports;var m=cache[id]={exports:{}};modules[id](require,m,m.exports);return m.exports;}require('entry');})();`;
(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try {
    const page=await browser.newPage({viewport:{width:1400,height:1000}});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    const sources=[{slug:'orders',name:'Pedidos',schema:{db:{table:'orders'},ui:{color:'#235685'},fields:[
      {name:'country',label:'País',type:'text',filter:true}, {name:'year',label:'Año',type:'number',filter:true}, {name:'amount',label:'Importe',type:'money',filter:true},
    ]}}];
    let saved=[], previews=0, runs=0, delaySave=false, releaseSave;
    const saves=[];
    await page.route('http://localhost/api/reports**',async route=>{
      const req=route.request(); const body=req.method()==='GET'?null:req.postDataJSON();
      let response;
      if(req.method()==='GET') response=req.url().includes('metadata')?{sources}:{reports:saved};
      else if(req.method()==='DELETE'){saved=saved.filter(report=>report.id!==body.id);response={ok:true};}
      else if(body.action==='save'){
        saves.push(body);
        const report={...body.report,id:body.id||'00000000-0000-4000-8000-000000000001',updated_at:'2026-10-03T12:00:00Z'};
        saved=[report];response={report};
        if(delaySave) await new Promise(resolve=>{releaseSave=resolve;});
      } else {
        body.action==='preview'?previews++:runs++;
        const report=body.report||saved[0];
        response={result:report.type==='list'?{type:'list',columns:report.config.columns.map(({id,label})=>({id,label})),rows:[Object.fromEntries(report.config.columns.map(column=>[column.id,column.ref.field==='amount'?30:'ES']))],total:1,truncated:false,scanned:3}:
          {type:'matrix',rowLabels:[['ES']],columnLabels:[['2026']],valueLabels:['Importe'],cells:[[[30]]],rowTotals:[[30]],columnTotals:[[30]],totals:[30],scanned:3}};
      }
      await route.fulfill({contentType:'application/json',body:JSON.stringify(response)});
    });
    await page.route('http://localhost/informes',route=>route.fulfill({contentType:'text/html',body:'<div id="root" class="main-shell-content"></div>'}));
    await page.goto('http://localhost/informes');
    await page.addStyleTag({content:fs.readFileSync(require.resolve('bootstrap/dist/css/bootstrap.min.css'),'utf8')+'\n'+fs.readFileSync('apps/web/app/globals.css','utf8')+'\n'+styles.join('\n')});
    const icons=createRequire(path.resolve('packages/ui/package.json'));
    await page.route('**/*.woff2*',route=>route.fulfill({contentType:'font/woff2',body:fs.readFileSync(icons.resolve('bootstrap-icons/font/fonts/bootstrap-icons.woff2'))}));
    await page.addStyleTag({content:fs.readFileSync(icons.resolve('bootstrap-icons/font/bootstrap-icons.css'),'utf8')});
    await page.addScriptTag({content:bundle});
    await page.getByRole('button',{name:/Nuevo informe/}).click({timeout:10000}).catch(async error=>{console.error(errors,await page.locator('body').innerText());throw error;});
    await page.getByLabel('Nombre',{exact:true}).fill('Ventas por país');
    await page.getByLabel('Módulo principal').selectOption('orders');
    await page.evaluate(()=>{window.dragEvents=[];for(const type of ['dragstart','dragover','drop'])document.addEventListener(type,event=>window.dragEvents.push({type,data:event.dataTransfer?.getData('application/jiro-field')}));});
    await page.getByRole('button',{name:'País',exact:true}).dragTo(page.getByRole('region',{name:'Zona Columnas',exact:true}));
    assert.equal(await page.getByLabel('Etiqueta 1 de columns').inputValue({timeout:5000}).catch(async error=>{console.error(await page.evaluate(()=>window.dragEvents),errors);throw error;}),'País');
    await page.getByRole('button',{name:'Importe',exact:true}).click();
    await page.getByRole('button',{name:'Añadir campo seleccionado',exact:true}).click();
    await page.getByLabel('Agregación 2 de columns').selectOption('sum');
    await page.getByRole('button',{name:'Subir Importe',exact:true}).click();
    assert.equal(await page.getByLabel('Etiqueta 1 de columns').inputValue(),'Importe');
    await page.getByRole('button',{name:'Añadir orden',exact:true}).click();
    await page.getByLabel('Dirección de ordenación').selectOption('desc');
    const transfer = await page.evaluateHandle(()=>new DataTransfer());
    await page.getByRole('button',{name:'País',exact:true}).dispatchEvent('dragstart',{dataTransfer:transfer});
    await page.getByRole('region',{name:'Zona Filtros',exact:true}).dispatchEvent('drop',{dataTransfer:transfer});
    assert.equal(await page.getByLabel('Campo del filtro').inputValue(),JSON.stringify(['','country']));
    await page.getByLabel('Valor del filtro').fill('ES');
    await page.getByRole('button',{name:'Aplicar',exact:true}).click();
    assert.equal(previews,0);
    await page.getByRole('button',{name:'Vista previa',exact:true}).click();
    await page.getByRole('cell',{name:'ES',exact:true}).waitFor();
    assert.equal(previews,1);
    delaySave=true;
    const saving=page.waitForRequest(request=>request.method()==='POST'&&request.postDataJSON()?.action==='save');
    await page.getByRole('button',{name:'Guardar informe',exact:true}).click();
    await saving;
    await page.getByLabel('Nombre',{exact:true}).fill('Ventas actualizadas');
    releaseSave();
    await page.getByText('Versión guardada. Hay cambios posteriores pendientes de guardar.',{exact:true}).waitFor();
    assert.equal(await page.getByLabel('Nombre',{exact:true}).inputValue(),'Ventas actualizadas');
    delaySave=false;
    await page.getByRole('button',{name:'Guardar informe',exact:true}).click();
    await page.getByText('Informe guardado.',{exact:true}).waitFor();
    assert.equal(saves[1].id,saved[0].id);
    assert.equal(saved[0].filters.items[0].value,'ES');
    await page.getByRole('button',{name:'Volver a informes',exact:true}).click();
    await page.getByRole('button',{name:'Acciones',exact:true}).click();
    await page.getByRole('menuitem',{name:/Ver$/}).click();
    await page.getByRole('heading',{name:'Resultado',exact:true}).waitFor();
    assert.equal(runs,1);
    await page.getByRole('button',{name:'Editar informe',exact:true}).click();
    await page.getByLabel('Tipo de informe',{exact:true}).selectOption('matrix');
    for(const [field,zone] of [['País','Filas'],['Año','Columnas'],['Importe','Valores']]) {
      await page.getByRole('button',{name:field,exact:true}).click();
      await page.getByRole('region',{name:'Zona '+zone,exact:true}).getByRole('button',{name:'Añadir campo seleccionado',exact:true}).click();
    }
    await page.getByRole('button',{name:'Vista previa',exact:true}).click();
    await page.locator('.jiro-report-matrix').waitFor();
    assert.match(await page.locator('.jiro-report-matrix').innerText(),/Total/);
    fs.mkdirSync('.tmp',{recursive:true});
    await page.getByRole('heading',{name:'Editar informe',exact:true}).scrollIntoViewIfNeeded();
    await page.screenshot({path:'.tmp/reports-desktop.png',fullPage:true});
    await page.locator('.jiro-report-matrix').scrollIntoViewIfNeeded();
    await page.screenshot({path:'.tmp/reports-matrix.png'});
    await page.setViewportSize({width:390,height:844});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.getByRole('region',{name:'Zona Valores',exact:true}).scrollIntoViewIfNeeded();
    await page.screenshot({path:'.tmp/reports-mobile.png'});
    await page.getByRole('button',{name:'Guardar informe',exact:true}).click();
    await page.getByText('Informe guardado.',{exact:true}).waitFor();
    assert.equal(saved[0].type,'matrix');
    await page.getByRole('button',{name:'Volver a informes',exact:true}).click();
    await page.getByRole('button',{name:'Acciones',exact:true}).click();
    await page.getByRole('menuitem',{name:/Eliminar$/}).click();
    await page.getByRole('button',{name:'Eliminar',exact:true}).click();
    await page.waitForFunction(()=>!document.querySelector('[role="dialog"]'));
    assert.equal(saved.length,0);
    assert.deepEqual(errors,[]);
    console.log('PASS report designer drag/drop, accessible add/reorder, filters, preview, save, run/edit/delete, MATRIX and mobile.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
