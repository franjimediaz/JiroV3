import "server-only";
import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { WebPublicationManifest } from "@repo/web-schema";
import { GithubError, PUBLICATION_PATH, type GithubConfig } from "./config";
import { canonical, publicationContent } from "./compare";

type Preparation = {v:1;jti:string;iat:number;exp:number;localDigest:string;remoteSha:string|null;configDigest:string;publicationId:string;pageCount:number};
const lifetimeSeconds=5*60;
function secret(env:NodeJS.ProcessEnv=process.env) {
  const value=env.WEB_PUBLICATION_PREPARATION_SECRET;
  if(!value||Buffer.byteLength(value,"utf8")<32)throw new GithubError("CONFIG_ERROR","Falta WEB_PUBLICATION_PREPARATION_SECRET o tiene menos de 32 bytes.");
  return value;
}
function digest(value:string){return createHash("sha256").update(value).digest("base64url");}
export function publicationDigest(manifest:WebPublicationManifest){return digest(canonical(publicationContent(manifest)));}
export function githubConfigDigest(config:GithubConfig){return digest(canonical({owner:config.owner.toLowerCase(),repository:config.repository.toLowerCase(),branch:config.branch,path:PUBLICATION_PATH}));}
export function createPreparation(manifest:WebPublicationManifest,remoteSha:string|null,config:GithubConfig,now=Math.floor(Date.now()/1000),env:NodeJS.ProcessEnv=process.env) {
  const payload:Preparation={v:1,jti:randomUUID(),iat:now,exp:now+lifetimeSeconds,localDigest:publicationDigest(manifest),remoteSha,configDigest:githubConfigDigest(config),publicationId:manifest.publicationId,pageCount:manifest.pages.length};
  const encoded=Buffer.from(JSON.stringify(payload)).toString("base64url");
  return encoded+"."+createHmac("sha256",secret(env)).update(encoded).digest("base64url");
}
export function verifyPreparation(token:unknown,config:GithubConfig,now=Math.floor(Date.now()/1000),env:NodeJS.ProcessEnv=process.env):Preparation {
  try {
    if(typeof token!=="string"||token.length>4096)throw new Error();
    const parts=token.split(".");if(parts.length!==2)throw new Error();
    const [encoded,signature]=parts;const expected=createHmac("sha256",secret(env)).update(encoded).digest();const received=Buffer.from(signature,"base64url");
    if(received.length!==expected.length||!timingSafeEqual(received,expected))throw new Error();
    const value:unknown=JSON.parse(Buffer.from(encoded,"base64url").toString("utf8"));
    if(!value||typeof value!=="object"||Array.isArray(value))throw new Error();
    const p=value as Record<string,unknown>;const keys=Object.keys(p).sort().join(",");
    if(keys!=="configDigest,exp,iat,jti,localDigest,pageCount,publicationId,remoteSha,v"||p.v!==1||typeof p.jti!=="string"||typeof p.iat!=="number"||typeof p.exp!=="number"||typeof p.localDigest!=="string"||(p.remoteSha!==null&&typeof p.remoteSha!=="string")||typeof p.configDigest!=="string"||typeof p.publicationId!=="string"||typeof p.pageCount!=="number"||!Number.isInteger(p.pageCount)||p.pageCount<1||p.iat>now+30||p.exp-p.iat!==lifetimeSeconds||p.configDigest!==githubConfigDigest(config))throw new Error();
    if(p.exp<now)throw new GithubError("PREPARATION_EXPIRED","La preparación ha caducado. Realiza una nueva comprobación.");
    return p as Preparation;
  } catch(error) {
    if(error instanceof GithubError)throw error;
    throw new GithubError("PREPARATION_INVALID","La confirmación de publicación no es válida.");
  }
}
