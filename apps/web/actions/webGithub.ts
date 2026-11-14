"use server";
import { randomUUID } from "node:crypto";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { writeAuditEvent } from "@/lib/audit/writeAuditEvent";
import { generateWebPublication } from "./webPublication";
import { parsePublicationManifest } from "@repo/web-schema";
import { getGithubConfig, GithubError } from "@/lib/web-publication/github/config";
import { readGithubPublication, writeGithubPublication } from "@/lib/web-publication/github/client";
import { comparePublications, imageResourceWarnings } from "@/lib/web-publication/github/compare";
import { createPreparation, publicationDigest, verifyPreparation } from "@/lib/web-publication/github/preparation";
const githubCodes=new Set(["CONFIG_ERROR","AUTH_ERROR","REPOSITORY_ERROR","REMOTE_NOT_FOUND","REMOTE_INVALID","NO_CHANGES","CHANGES_DETECTED","FORBIDDEN","LOCAL_ERROR","SIZE_LIMIT","PREPARATION_INVALID","PREPARATION_EXPIRED","LOCAL_CHANGED","REMOTE_CHANGED","WRITE_PERMISSION_ERROR","NETWORK_ERROR","CONFLICT"]);
function githubFailure(error:unknown) {
  if(error instanceof GithubError)return {code:error.code,message:error.message};
  if(error&&typeof error==="object"&&"code" in error&&"message" in error&&typeof error.code==="string"&&githubCodes.has(error.code)&&typeof error.message==="string")return {code:error.code,message:error.message};
  return null;
}
function parseLocalPublication(json:string) {
  try { return parsePublicationManifest(json); }
  catch { throw new GithubError("LOCAL_ERROR","El manifiesto generado no es válido."); }
}
export async function checkWebGithubPublication() {
  const requestId=randomUUID();let actorUserId:string|undefined;let branch:string|null=null;
  try {
    const context=await getCurrentUser();actorUserId=context?.user.id;
    if(!context||context.role?.slug!=="systemadmin")throw new GithubError("FORBIDDEN","Acceso denegado.");
    const config=getGithubConfig();branch=config.branch;
    const local=await generateWebPublication();
    if(!local.ok||!local.json)throw new GithubError("LOCAL_ERROR","No se pudo generar el manifiesto local. Valida las páginas antes de comprobar GitHub.");
    const manifest=parsePublicationManifest(local.json);
    const warnings=imageResourceWarnings(manifest);
    const remote=await readGithubPublication(config);
    const comparison=comparePublications(manifest,remote.json);
    const ok=comparison.status!=="REMOTE_INVALID";
    const messages={REMOTE_NOT_FOUND:"Conexión correcta. Primera publicación: el archivo todavía no existe.",REMOTE_INVALID:"El manifiesto remoto no es válido.",NO_CHANGES:"Conexión correcta. No hay cambios de contenido pendientes.",CHANGES_DETECTED:"Conexión correcta. Hay cambios pendientes."};
    await writeAuditEvent({action:"webGithub.check",requestId,actorUserId,success:ok,metadata:{code:comparison.status,localPageCount:comparison.localPageCount,remotePageCount:comparison.remotePageCount}});
    return {ok,code:comparison.status,message:messages[comparison.status],branch,comparison,warnings};
  } catch(error) {
    const failure=githubFailure(error);const code=failure?.code??"INTERNAL";
    await writeAuditEvent({action:"webGithub.check",requestId,actorUserId,success:false,metadata:{code}});
    return {ok:false,code,message:failure?.message??"No se pudo comprobar la publicación.",branch,comparison:null,warnings:[]};
  }
}

export async function prepareWebPublication() {
  const requestId=randomUUID();let actorUserId:string|undefined;let branch:string|null=null;
  try {
    const context=await getCurrentUser();actorUserId=context?.user.id;
    if(!context||context.role?.slug!=="systemadmin")throw new GithubError("FORBIDDEN","Acceso denegado.");
    const config=getGithubConfig();branch=config.branch;
    const local=await generateWebPublication();
    if(!local.ok||!local.json||!local.publicationId)throw new GithubError(local.code,"No se pudo generar el manifiesto local. Valida las páginas antes de publicar.");
    const manifest=parseLocalPublication(local.json);const warnings=imageResourceWarnings(manifest);
    const remote=await readGithubPublication(config);const comparison=comparePublications(manifest,remote.json);
    if(comparison.status==="REMOTE_INVALID")throw new GithubError("REMOTE_INVALID","El manifiesto remoto no es válido. No se puede publicar sobre él.");
    const preparationToken=comparison.changed?createPreparation(manifest,remote.sha,config):null;
    const code=comparison.changed?"READY":"NO_CHANGES";
    const message=comparison.changed?"Preparación lista. Confirma para crear el commit.":"La web ya está actualizada.";
    await writeAuditEvent({action:"webGithub.prepare",requestId,actorUserId,success:true,metadata:{code,publicationId:local.publicationId,pageCount:comparison.localPageCount}});
    return {ok:true,code,message,branch,comparison,warnings,preparationToken,publicationId:local.publicationId,pageCount:comparison.localPageCount};
  } catch(error) {
    const failure=githubFailure(error);const code=failure?.code??"INTERNAL";
    await writeAuditEvent({action:"webGithub.prepare",requestId,actorUserId,success:false,metadata:{code}});
    return {ok:false,code,message:failure?.message??"No se pudo preparar la publicación.",branch,comparison:null,warnings:[],preparationToken:null,publicationId:null,pageCount:0};
  }
}

export async function publishWebPublication(input:unknown) {
  const requestId=randomUUID();let actorUserId:string|undefined;let publicationId:string|null=null;let pageCount=0;
  try {
    const context=await getCurrentUser();actorUserId=context?.user.id;
    if(!context||context.role?.slug!=="systemadmin")throw new GithubError("FORBIDDEN","Acceso denegado.");
    if(!input||typeof input!=="object"||Array.isArray(input)||Object.keys(input).sort().join(",")!=="preparationToken")throw new GithubError("PREPARATION_INVALID","La confirmación de publicación no es válida.");
    const config=getGithubConfig();const prepared=verifyPreparation((input as {preparationToken?:unknown}).preparationToken,config);
    const local=await generateWebPublication();
    if(!local.ok||!local.json||!local.publicationId)throw new GithubError(local.code,"No se pudo regenerar el manifiesto local.");
    const manifest=parseLocalPublication(local.json);publicationId=local.publicationId;pageCount=manifest.pages.length;
    if(publicationDigest(manifest)!==prepared.localDigest||pageCount!==prepared.pageCount)throw new GithubError("LOCAL_CHANGED","Las páginas han cambiado desde la preparación. Realiza una nueva comprobación.");
    const remote=await readGithubPublication(config);
    if(remote.sha!==prepared.remoteSha)throw new GithubError("REMOTE_CHANGED","GitHub ha cambiado desde la preparación. Realiza una nueva comprobación.");
    const comparison=comparePublications(manifest,remote.json);
    if(comparison.status==="REMOTE_INVALID")throw new GithubError("REMOTE_INVALID","El manifiesto remoto no es válido.");
    if(!comparison.changed) {
      await writeAuditEvent({action:"webGithub.publish",requestId,actorUserId,success:true,metadata:{code:"NO_CHANGES",publicationId,pageCount}});
      return {ok:true,code:"NO_CHANGES",message:"La web ya está actualizada.",publicationId,pageCount,commitSha:null,commitUrl:null};
    }
    const commit=await writeGithubPublication(config,local.json,remote.sha);
    await writeAuditEvent({action:"webGithub.publish",requestId,actorUserId,success:true,resourceId:commit.commitSha,metadata:{code:"COMMITTED",publicationId,pageCount,commitSha:commit.commitSha}});
    return {ok:true,code:"COMMITTED",message:"Commit creado. El despliegue web queda pendiente del proveedor configurado.",publicationId,pageCount,...commit};
  } catch(error) {
    const failure=githubFailure(error);const code=failure?.code??"INTERNAL";
    await writeAuditEvent({action:"webGithub.publish",requestId,actorUserId,success:false,metadata:{code,publicationId,pageCount}});
    return {ok:false,code,message:failure?.message??"No se pudo publicar la web.",publicationId,pageCount,commitSha:null,commitUrl:null};
  }
}
