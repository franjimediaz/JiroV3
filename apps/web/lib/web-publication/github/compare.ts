import "server-only";
import { parsePublicationManifest, validatePublicationManifest, type WebPublicationManifest } from "@repo/web-schema";
import { validateWebPuckData } from "@repo/web-puck";
import { MAX_PUBLICATION_BYTES } from "../buildManifest";
export function canonical(value: unknown): string {
  if(Array.isArray(value))return "["+value.map(canonical).join(",")+"]";
  if(value!==null&&typeof value==="object")return "{"+Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([key,item])=>JSON.stringify(key)+":"+canonical(item)).join(",")+"}";
  return JSON.stringify(value);
}
function checked(value:unknown) {
  const manifest=validatePublicationManifest(value);
  if(!manifest.pages.some(p=>p.path==="/"))throw new Error("Missing root");
  for(const page of manifest.pages)validateWebPuckData(page.puckData);
  return manifest;
}
export function comparePublications(localValue:unknown,remoteJson:string|null) {
  const local=checked(localValue);
  const empty={changed:false,localPageCount:local.pages.length,remotePageCount:0,addedPaths:[] as string[],removedPaths:[] as string[],updatedPaths:[] as string[]};
  if(remoteJson===null)return {...empty,status:"REMOTE_NOT_FOUND" as const,changed:true,addedPaths:local.pages.map(p=>p.path).sort()};
  let remote:WebPublicationManifest;
  try { if(new TextEncoder().encode(remoteJson).byteLength>MAX_PUBLICATION_BYTES)throw new Error();remote=checked(parsePublicationManifest(remoteJson)); }
  catch { return {...empty,status:"REMOTE_INVALID" as const}; }
  const left=new Map(local.pages.map(p=>[p.path,p])),right=new Map(remote.pages.map(p=>[p.path,p]));
  const addedPaths=[...left.keys()].filter(p=>!right.has(p)).sort();
  const removedPaths=[...right.keys()].filter(p=>!left.has(p)).sort();
  const updatedPaths=[...left.keys()].filter(p=>right.has(p)&&canonical(left.get(p))!==canonical(right.get(p))).sort();
  const changed=!!(addedPaths.length||removedPaths.length||updatedPaths.length||canonical(local.theme)!==canonical(remote.theme)||local.schemaVersion!==remote.schemaVersion);
  return {status:changed?"CHANGES_DETECTED" as const:"NO_CHANGES" as const,changed,localPageCount:local.pages.length,remotePageCount:remote.pages.length,addedPaths,removedPaths,updatedPaths};
}
export function imageResourceWarnings(manifest:WebPublicationManifest) {
  const warnings:{path:string;url:string;message:string}[]=[];
  for(const page of manifest.pages){
    const seen=new Set<string>();
    function image(url:unknown){if(typeof url!=="string"||seen.has(url))return;seen.add(url);warnings.push({path:page.path,url,message:url.startsWith("https://")?"Referencia HTTPS aceptada; no descargada ni verificada. Su disponibilidad futura no está garantizada.":url.startsWith("http://")?"La imagen externa no utiliza HTTPS; revisa la referencia antes del despliegue.":"Referencia local: deberá estar disponible en apps/web-static/public durante el despliegue. No se ha comprobado ni copiado el archivo."});}
    function walk(value:unknown){if(Array.isArray(value)){value.forEach(walk);return;}if(!value||typeof value!=="object")return;const node=value as Record<string,unknown>;const props=node.props as Record<string,unknown>|undefined;if(node.type==="ImageBlock")image(props?.src);if(node.type==="Hero"&&props?.image)image((props.image as Record<string,unknown>).src);Object.values(node).forEach(walk);}
    walk(page.puckData);
  }
  return warnings;
}
