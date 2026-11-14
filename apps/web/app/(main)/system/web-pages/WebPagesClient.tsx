"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { generateWebPublication } from "@/actions/webPublication";
import { checkWebGithubPublication, prepareWebPublication, publishWebPublication } from "@/actions/webGithub";
import type { listWebPages } from "@/actions/webPages";

type Preparation=Awaited<ReturnType<typeof prepareWebPublication>>;
export default function WebPagesClient({result}:{result:Awaited<ReturnType<typeof listWebPages>>}) {
  const [notice,setNotice]=useState("");const [failed,setFailed]=useState(false);const [generating,setGenerating]=useState(false);
  const [checking,setChecking]=useState(false);const [github,setGithub]=useState<Awaited<ReturnType<typeof checkWebGithubPublication>>|null>(null);
  const [publishing,setPublishing]=useState(false);const [preparation,setPreparation]=useState<Preparation|null>(null);const [publishResult,setPublishResult]=useState<Awaited<ReturnType<typeof publishWebPublication>>|null>(null);
  const generateLock=useRef(false),checkLock=useRef(false),publishLock=useRef(false);
  const busy=generating||checking||publishing;
  async function generate(){if(generateLock.current)return;generateLock.current=true;setGenerating(true);setFailed(false);setNotice("");try{const response=await generateWebPublication();if(!response.ok||response.json===null){setFailed(true);setNotice(response.message);return;}const url=URL.createObjectURL(new Blob([response.json],{type:"application/json;charset=utf-8"}));const link=document.createElement("a");link.href=url;link.download="publication.json";document.body.appendChild(link);link.click();link.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1000);setNotice(response.pageCount+" páginas incluidas. "+response.message);}catch{setFailed(true);setNotice("No se pudo generar la publicación. Inténtalo de nuevo.");}finally{generateLock.current=false;setGenerating(false);}}
  async function checkGithub(){if(checkLock.current)return;checkLock.current=true;setChecking(true);setGithub(null);try{setGithub(await checkWebGithubPublication());}catch{setGithub({ok:false,code:"INTERNAL",message:"No se pudo conectar. Inténtalo de nuevo.",branch:null,comparison:null,warnings:[]});}finally{checkLock.current=false;setChecking(false);}}
  async function prepare(){if(publishLock.current)return;publishLock.current=true;setPublishing(true);setPreparation(null);setPublishResult(null);try{setPreparation(await prepareWebPublication());}catch{setPublishResult({ok:false,code:"INTERNAL",message:"No se pudo preparar la publicación.",publicationId:null,pageCount:0,commitSha:null,commitUrl:null});}finally{publishLock.current=false;setPublishing(false);}}
  async function confirm(){if(publishLock.current||!preparation?.ok||!preparation.preparationToken)return;publishLock.current=true;setPublishing(true);setPublishResult(null);try{const response=await publishWebPublication({preparationToken:preparation.preparationToken});setPublishResult(response);if(response.ok)setPreparation(null);}catch{setPublishResult({ok:false,code:"INTERNAL",message:"No se pudo publicar la web.",publicationId:null,pageCount:0,commitSha:null,commitUrl:null});}finally{publishLock.current=false;setPublishing(false);}}
  return <section className="p-3">
    <h1>Páginas web</h1>
    <div className="d-flex flex-wrap gap-2 mb-3">
      <Link className="btn btn-primary" href="/system/web-pages/new">Nueva página</Link>
      <button type="button" className="btn btn-secondary" disabled={busy} onClick={generate}>{generating?"Generando...":"Generar publicación JSON"}</button>
      <button type="button" className="btn btn-outline-secondary" disabled={busy} onClick={checkGithub}>{checking?"Comprobando...":"Comprobar publicación en GitHub"}</button>
      <button type="button" className="btn btn-success" disabled={busy} onClick={prepare}>{publishing?"Preparando...":"Publicar web"}</button>
    </div>
    <p role={failed?"alert":"status"}>{notice}</p>
    {github&&<GithubSummary value={github}/>}
    {preparation&&<div role={preparation.ok?"status":"alert"} className="mb-3"><h2>Resumen previo</h2><p>{preparation.message}</p>{preparation.branch&&<p>Rama: {preparation.branch}</p>}{preparation.comparison&&<Comparison value={preparation.comparison}/>}<Warnings values={preparation.warnings}/>{preparation.ok&&preparation.preparationToken&&<div className="d-flex gap-2"><button type="button" className="btn btn-danger" disabled={publishing} onClick={confirm}>{publishing?"Publicando...":"Confirmar publicación"}</button><button type="button" className="btn btn-outline-secondary" disabled={publishing} onClick={()=>setPreparation(null)}>Cancelar</button></div>}</div>}
    {publishResult&&<div role={publishResult.ok?"status":"alert"}><p>{publishResult.message}</p>{publishResult.commitUrl&&<p><a href={publishResult.commitUrl} target="_blank" rel="noopener noreferrer">Ver commit {publishResult.commitSha}</a></p>}{publishResult.code==="COMMITTED"&&<p>GitHub confirmó el commit; el despliegue queda pendiente de Vercel u otro proveedor configurado.</p>}</div>}
    {!result.ok?<p role="alert">{result.message}</p>:result.data.length===0?<p>No hay páginas. <Link href="/system/web-pages/new">Crear la primera página</Link></p>:<div className="table-responsive"><table className="table"><thead><tr><th>Título</th><th>Ruta</th><th>Última modificación</th><th>Acciones</th></tr></thead><tbody>{result.data.map(page=><tr key={page.id}><td>{page.title}</td><td>{page.path}</td><td>{page.updated_at}</td><td><Link href={"/system/web-editor/"+page.id}>Editar</Link>{" · "}<Link href={"/system/web-pages/"+page.id}>Configuración</Link></td></tr>)}</tbody></table></div>}
  </section>;
}
function GithubSummary({value}:{value:Awaited<ReturnType<typeof checkWebGithubPublication>>}){return <div role={value.ok?"status":"alert"} className="mb-3"><p>{value.message}</p>{value.branch&&<p>Rama: {value.branch}</p>}{value.comparison&&<Comparison value={value.comparison}/>}<Warnings values={value.warnings}/><p>Solo comprobación: no se ha publicado ni modificado GitHub.</p></div>;}
function Comparison({value}:{value:{localPageCount:number;remotePageCount:number;addedPaths:string[];updatedPaths:string[];removedPaths:string[]}}){return <><p>Páginas locales: {value.localPageCount}. Remotas: {value.remotePageCount}.</p><p>Añadidas: {value.addedPaths.join(", ")||"Ninguna"}</p><p>Modificadas: {value.updatedPaths.join(", ")||"Ninguna"}</p><p>Eliminadas: {value.removedPaths.join(", ")||"Ninguna"}</p></>;}
function Warnings({values}:{values:{path:string;url:string;message:string}[]}){return values.length?<ul>{values.map((warning,index)=><li key={index}>{warning.path}: {warning.url} — {warning.message}</li>)}</ul>:null;}
