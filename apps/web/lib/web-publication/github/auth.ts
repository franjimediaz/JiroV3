import "server-only";
import { sign } from "node:crypto";
import { GithubError, type GithubConfig } from "./config";
export function createAppJwt(config: GithubConfig, now = Math.floor(Date.now()/1000)) {
  const encode=(value: unknown)=>Buffer.from(JSON.stringify(value)).toString("base64url");
  const data=encode({alg:"RS256",typ:"JWT"})+"."+encode({iat:now-60,exp:now+540,iss:config.appId});
  return data+"."+sign("RSA-SHA256",Buffer.from(data),config.privateKey).toString("base64url");
}
export async function requestGithub(endpoint: string, token: string, method: "GET" | "POST" | "PUT" = "GET", body?: unknown) {
  try {
    return await fetch("https://api.github.com"+endpoint,{method,redirect:"error",cache:"no-store",signal:AbortSignal.timeout(15000),headers:{Accept:"application/vnd.github+json",Authorization:"Bearer "+token,"X-GitHub-Api-Version":"2026-03-10","Content-Type":"application/json"},...(body===undefined?{}:{body:JSON.stringify(body)})});
  } catch { throw new GithubError(method==="POST"?"AUTH_ERROR":method==="PUT"?"NETWORK_ERROR":"REPOSITORY_ERROR","No se pudo conectar con GitHub."); }
}
export async function readGithubJson(response: Response, code: string, maxBytes=2*1024*1024): Promise<Record<string, unknown>> {
  try {
    if (!response.body) throw new Error();
    const reader=response.body.getReader();const chunks:Uint8Array[]=[];let total=0;
    try { for (;;) { const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>maxBytes)throw new Error();chunks.push(value); } }
    finally { await reader.cancel(); }
    const data:unknown=JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if(!data||typeof data!=="object"||Array.isArray(data))throw new Error();
    return data as Record<string,unknown>;
  } catch { throw new GithubError(code,"GitHub devolvió una respuesta inválida o demasiado grande."); }
}
export async function getInstallationToken(config: GithubConfig, contents: "read" | "write" = "read") {
  let jwt: string;
  try { jwt=createAppJwt(config); } catch { throw new GithubError("AUTH_ERROR","No se pudo autenticar la GitHub App."); }
  const response=await requestGithub("/app/installations/"+config.installationId+"/access_tokens",jwt,"POST",{repositories:[config.repository],permissions:{contents,metadata:"read"}});
  if(!response.ok)throw new GithubError("AUTH_ERROR","No se pudo obtener acceso a la instalación de GitHub App.");
  const data=await readGithubJson(response,"AUTH_ERROR",64*1024);
  if(typeof data.token!=="string"||!data.token||typeof data.expires_at!=="string"||Date.parse(data.expires_at)<=Date.now()||!Number.isFinite(Date.parse(data.expires_at)))throw new GithubError("AUTH_ERROR","Token de instalación inválido.");
  return data.token;
}
