"use server";
import { randomUUID } from "node:crypto";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { writeAuditEvent } from "@/lib/audit/writeAuditEvent";
import { generateWebPublication } from "./webPublication";
import { parsePublicationManifest } from "@repo/web-schema";
import { getGithubConfig, GithubError } from "@/lib/web-publication/github/config";
import { readGithubPublication } from "@/lib/web-publication/github/client";
import { comparePublications, imageResourceWarnings } from "@/lib/web-publication/github/compare";
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
    const code=error instanceof GithubError?error.code:"INTERNAL";
    await writeAuditEvent({action:"webGithub.check",requestId,actorUserId,success:false,metadata:{code}});
    return {ok:false,code,message:error instanceof GithubError?error.message:"No se pudo comprobar la publicación.",branch,comparison:null,warnings:[]};
  }
}
