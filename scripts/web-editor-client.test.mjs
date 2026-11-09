import test from 'node:test';
import assert from 'node:assert/strict';
import { createSourceLoader } from './helpers/dashboard-fixtures.mjs';

const base = 'apps/web/app/(main)/system/web-editor/';
const fixture = createSourceLoader()(base + 'fixture.ts');
function all(node) {
  if (!node || typeof node !== 'object') return [];
  const children = node.props?.children;
  return [node, ...(Array.isArray(children) ? children.flat(Infinity) : [children]).flatMap(all)];
}
function harness(options = {}) {
  const slots = [], calls = [], effects = [], downloads = [];
  let index = 0, current = fixture.createEditorExample(), response = options.response;
  const hooks = {
    useState(initial) { const n = index++; if (!(n in slots)) slots[n] = typeof initial === 'function' ? initial() : initial; return [slots[n], value => { slots[n] = typeof value === 'function' ? value(slots[n]) : value; }]; },
    useRef(initial) { const n = index++; if (!(n in slots)) slots[n] = {current:initial}; return slots[n]; },
    useCallback(fn) { return fn; }, useMemo(fn) { return fn(); }, useEffect(fn) { effects.push(fn); },
  };
  const Puck = () => null;
  const api = {
    async saveWebPageDraftById(input) { calls.push({action:'id',input}); return response ?? {ok:true,data:{id:input.id,revision:input.revision+1},message:'Saved',code:'OK'}; },
    async saveWebPageDraft(input) { calls.push({action:'root',input}); return {ok:true,id:'created-root',revision:1,message:'Saved',code:'OK'}; },
  };
  const load=createSourceLoader({react:hooks,'@/actions/webPages':api,'@puckeditor/core':{Puck,useGetPuck:()=>()=>({appState:{data:current}})}});
  const Editor=load(base+'WebEditorClient.tsx').default;
  const props={previewCss:'',initialData:current,initialRevision:options.root?null:4,description:'SEO',pageId:options.root?undefined:'contact-id',publicPath:options.root?'/':'/contacto'};
  function render() {
    index=0;const tree=Editor(props);const puck=all(tree).find(node=>node.type===Puck);
    const actionsElement=puck.props.overrides.headerActions();const actions=actionsElement.type(actionsElement.props);
    return { tree,puck,button(text){return all(actions).find(node=>node.type==='button'&&node.props.children===text);},status(){return all(tree).filter(node=>node.props?.role==='status').map(node=>node.props.children);}};
  }
  return {calls,downloads,effects,render,change(data){current=data;render().puck.props.onChange(data);},data(){return current;},respond(value){response=value;}};
}
test('client ignores optional undefined changes and saves the selected page by ID',async()=>{
 const h=harness();const data=structuredClone(h.data());data.content[0].props.image=undefined;h.change(data);
 assert.ok(h.render().status().includes('Sin cambios'));
 data.root.props.title='Editado';h.change(data);assert.ok(h.render().status().includes('Cambios sin guardar'));
 await h.render().button('Guardar borrador').props.onClick();
 assert.equal(h.calls[0].action,'id');assert.equal(h.calls[0].input.id,'contact-id');assert.equal(h.calls[0].input.revision,4);assert.ok(h.render().status().includes('Guardado'));
 await h.render().button('Guardar borrador').props.onClick();assert.equal(h.calls[1].input.revision,5);
});
test('client preserves revision after conflict and distinguishes conflict from error',async()=>{
 const h=harness({response:{ok:false,code:'CONFLICT',message:'Changed',data:null}});
 const data=structuredClone(h.data());data.root.props.title='Pending';h.change(data);
 await h.render().button('Guardar borrador').props.onClick();assert.ok(h.render().status().includes('Conflicto'));
 h.respond({ok:false,code:'DATABASE',message:'Offline',data:null});await h.render().button('Guardar borrador').props.onClick();assert.ok(h.render().status().includes('Error'));assert.equal(h.calls[1].input.revision,4);
});
test('root compatibility creates once, then saves by returned ID',async()=>{
 const h=harness({root:true});await h.render().button('Guardar borrador').props.onClick();await h.render().button('Guardar borrador').props.onClick();
 assert.equal(h.calls[0].action,'root');assert.equal(h.calls[0].input.revision,null);assert.equal(h.calls[1].action,'id');assert.equal(h.calls[1].input.id,'created-root');
});
test('export does not save or clear dirty state; reset confirms and never writes',async()=>{
 const oldWindow=globalThis.window, oldDocument=globalThis.document;
 let confirms=0,clicked=0,listener,allow=false;
 globalThis.window={confirm(){confirms++;return allow;},setTimeout(fn){fn();},addEventListener(name,fn){if(name==='beforeunload')listener=fn;},removeEventListener(){}};
 globalThis.document={createElement(){return {click(){clicked++;},remove(){}};},body:{appendChild(){}}};
 try {
  const h=harness();const data=structuredClone(h.data());data.root.props.title='Pending';h.change(data);
  h.render().button('Exportar JSON').props.onClick();assert.equal(clicked,1);assert.equal(h.calls.length,0);assert.ok(h.render().status().includes('Cambios sin guardar'));
  h.render().button('Restablecer ejemplo').props.onClick();assert.equal(confirms,1);assert.equal(h.render().puck.props.data.root.props.title,'Página de ejemplo');
  allow=true;h.render().button('Restablecer ejemplo').props.onClick();assert.equal(confirms,2);assert.equal(h.calls.length,0);assert.ok(h.render().status().includes('Cambios sin guardar'));
  h.render();h.effects.at(-1)();let prevented=false;listener({preventDefault(){prevented=true;}});assert.equal(prevented,true);
 } finally {globalThis.window=oldWindow;globalThis.document=oldDocument;}
});
