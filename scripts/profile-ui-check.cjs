// Real profile component in Edge; API fixtures never change real credentials.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {createRequire} = require('node:module');
const ts = require('typescript');
const {chromium} = require('playwright');
const appRequire = createRequire(path.resolve('apps/web/package.json'));
const modules = new Map();
function build(file) {
  file = path.resolve(file); if (modules.has(file)) return file;
  modules.set(file, '');
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true}}).outputText
    .replace(/require\(["']([^"']+)["']\)/g, (_, name) => {
      let dependency;
      try { dependency = createRequire(file).resolve(name); } catch { dependency = appRequire.resolve(name); }
      return `require(${JSON.stringify(build(dependency))})`;
    });
  modules.set(file, code); return file;
}
const react = build(appRequire.resolve('react'));
const dom = build(appRequire.resolve('react-dom/client'));
const component = build('apps/web/lib/profile/ProfileClient.tsx');
const bundle = `(function(){var process={env:{NODE_ENV:'development'}};var modules={${[...modules].map(([id, code])=>`${JSON.stringify(id)}:function(require,module,exports){\n${code}\n}`).join(',')}};var cache={};function require(id){if(cache[id])return cache[id].exports;var m=cache[id]={exports:{}};modules[id](require,m,m.exports);return m.exports;}require(${JSON.stringify(dom)}).createRoot(document.getElementById('root')).render(require(${JSON.stringify(react)}).createElement(require(${JSON.stringify(component)}).default));})();`;
(async()=>{
  const browser = await chromium.launch({channel:'msedge',headless:true});
  try {
    const page = await browser.newPage({viewport:{width:1200,height:1100}});
    const errors = []; page.on('pageerror', error=>errors.push(error.message));
    let profile = {name:'Ana',surname:'Pérez',email:'ana@example.test',emailStatus:null,pendingEmail:null};
    let fail = false, release;
    await page.route('http://localhost/api/profile', async route=>{
      if (route.request().method()==='GET') return route.fulfill({json:profile});
      const body = route.request().postDataJSON();
      if (fail) return route.fulfill({status:409,json:{error:{message:'El caso queda registrado para reconciliación técnica.'}}});
      let status='completed';
      if(body.action==='details') { profile={...profile,name:body.name,surname:body.surname}; await new Promise(resolve=>{release=resolve;}); }
      if(body.action==='email') { profile={...profile,emailStatus:'pending_confirmation',pendingEmail:body.email};status='pending_confirmation'; }
      if(body.action==='finishEmail') profile={...profile,email:profile.pendingEmail,pendingEmail:null,emailStatus:null};
      await route.fulfill({json:{status}});
    });
    await page.route('http://localhost/mi-perfil',route=>route.fulfill({contentType:'text/html',body:'<div id="root"></div>'}));
    await page.goto('http://localhost/mi-perfil');
    await page.addStyleTag({content:fs.readFileSync(require.resolve('bootstrap/dist/css/bootstrap.min.css'),'utf8')+'\n'+fs.readFileSync('apps/web/app/globals.css','utf8')});
    await page.addScriptTag({content:bundle});
    await page.getByLabel('Nombre',{exact:true}).fill('Ana María');
    await page.getByRole('button',{name:'Guardar datos personales'}).click();
    await page.getByText('Procesando…',{exact:true}).waitFor();
    assert.equal(await page.getByLabel('Nombre',{exact:true}).isDisabled(),true);
    release(); await page.getByText('Nombre y apellidos guardados.',{exact:true}).waitFor();
    await page.getByLabel('Email de acceso').fill('new@example.test');
    await page.getByRole('button',{name:'Cambiar email',exact:true}).click();
    await page.getByRole('button',{name:'Comprobar confirmación'}).waitFor();
    assert.equal(await page.locator('.alert-success').count(),0);
    assert.equal(await page.getByRole('button',{name:'Cambiar contraseña',exact:true}).isDisabled(),true);
    await page.getByRole('button',{name:'Comprobar confirmación'}).click();
    await page.getByText('Email actualizado y verificado en ambas fuentes.',{exact:true}).waitFor();
    await page.getByLabel('Contraseña actual',{exact:true}).fill('old-secret');
    await page.getByLabel('Nueva contraseña (mínimo 12 caracteres)',{exact:true}).fill('new-password-long');
    await page.getByLabel('Repetir nueva contraseña',{exact:true}).fill('new-password-long');
    await page.getByRole('button',{name:'Cambiar contraseña',exact:true}).click();
    await page.getByText('Contraseña actualizada.',{exact:true}).waitFor();
    assert.equal(await page.getByLabel('Contraseña actual',{exact:true}).inputValue(),'');
    fail=true;
    await page.getByRole('button',{name:'Cambiar email',exact:true}).click();
    await page.getByRole('alert').waitFor();
    assert.equal(await page.locator('.alert-success').count(),0);
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
    assert.deepEqual(errors,[]);
    console.log('Profile UI: details/loading, pending confirmation, success/error, password reset and mobile layout passed.');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
