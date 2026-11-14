"use client";
import { useRef, useState } from "react";
import { generateWebPublication } from "@/actions/webPublication";
import { checkWebGithubPublication } from "@/actions/webGithub";
import Link from "next/link";
import type { listWebPages } from "@/actions/webPages";
export default function WebPagesClient({result}:{result:Awaited<ReturnType<typeof listWebPages>>}) {
 const [checking,setChecking]=useState(false);
 const checkingRef=useRef(false);
 const [github,setGithub]=useState<Awaited<ReturnType<typeof checkWebGithubPublication>>|null>(null);
 async function checkGithub(){if(checkingRef.current)return;checkingRef.current=true;setChecking(true);setGithub(null);try{setGithub(await checkWebGithubPublication());}catch{setGithub({ok:false,code:"INTERNAL",message:"No se pudo conectar. Inténtalo de nuevo.",branch:null,comparison:null,warnings:[]});}finally{checkingRef.current=false;setChecking(false);}}
 const [generating, setGenerating] = useState(false);
 const [notice, setNotice] = useState("");
 const [failed, setFailed] = useState(false);
 const inFlight = useRef(false);
 async function generate() {
   if (inFlight.current) return;
   inFlight.current = true; setGenerating(true); setFailed(false); setNotice("");
   try {
     const response = await generateWebPublication();
     if (!response.ok || response.json === null) { setFailed(true); setNotice(response.message); return; }
     const url = URL.createObjectURL(new Blob([response.json], {type:"application/json;charset=utf-8"}));
     const link = document.createElement("a");
     link.href = url; link.download = "publication.json";
     document.body.appendChild(link); link.click(); link.remove();
     window.setTimeout(() => URL.revokeObjectURL(url), 1000);
     setNotice(response.pageCount + " páginas incluidas. " + response.message);
   } catch { setFailed(true); setNotice("No se pudo generar la publicación. Inténtalo de nuevo."); }
   finally { inFlight.current = false; setGenerating(false); }
 }
 return <section className="p-3"><h1>Páginas web</h1><Link className="btn btn-primary mb-3" href="/system/web-pages/new">Nueva página</Link>{" "}<button type="button" className="btn btn-secondary mb-3" disabled={generating} onClick={generate}>{generating ? "Generando..." : "Generar publicación JSON"}</button><p role={failed ? "alert" : "status"}>{notice}</p>
 <button type="button" className="btn btn-outline-secondary mb-3" disabled={checking} onClick={checkGithub}>{checking?"Comprobando...":"Comprobar publicación en GitHub"}</button>
 {github&&<div role={github.ok?"status":"alert"}><p>{github.message}</p>{github.branch&&<p>Rama: {github.branch}</p>}{github.comparison&&<><p>Páginas locales: {github.comparison.localPageCount}. Remotas: {github.comparison.remotePageCount}.</p><p>Añadidas: {github.comparison.addedPaths.join(", ")||"Ninguna"}</p><p>Modificadas: {github.comparison.updatedPaths.join(", ")||"Ninguna"}</p><p>Eliminadas: {github.comparison.removedPaths.join(", ")||"Ninguna"}</p></>}{github.warnings.length>0&&<ul>{github.warnings.map((warning,index)=><li key={index}>{warning.path}: {warning.url} — {warning.message}</li>)}</ul>}<p>Solo comprobación: no se ha publicado ni modificado GitHub.</p></div>}
 {!result.ok ? <p role="alert">{result.message}</p> : result.data.length===0 ? <p>No hay páginas. <Link href="/system/web-pages/new">Crear la primera página</Link></p> : <div className="table-responsive"><table className="table"><thead><tr><th>Título</th><th>Ruta</th><th>Última modificación</th><th>Acciones</th></tr></thead><tbody>{result.data.map(page=><tr key={page.id}><td>{page.title}</td><td>{page.path}</td><td>{page.updated_at}</td><td><Link href={"/system/web-editor/"+page.id}>Editar</Link>{" · "}<Link href={"/system/web-pages/"+page.id}>Configuración</Link></td></tr>)}</tbody></table></div>}</section>;
}
