import "server-only";
import { getInstallationToken, requestGithub, readGithubJson } from "./auth";
import { GithubError, PUBLICATION_PATH, type GithubConfig } from "./config";
import { MAX_PUBLICATION_BYTES } from "../buildManifest";
export async function readGithubPublication(config: GithubConfig) {
  const token=await getInstallationToken(config);
  const base="/repos/"+encodeURIComponent(config.owner)+"/"+encodeURIComponent(config.repository);
  async function get(endpoint:string,missing=false) {
    const response=await requestGithub(endpoint,token);
    if(response.status===401)throw new GithubError("AUTH_ERROR","La autenticación de GitHub ha caducado o no es válida.");
    if(missing&&response.status===404)return null;
    if(!response.ok)throw new GithubError("REPOSITORY_ERROR","No se puede acceder al repositorio o a la rama configurada.");
    return readGithubJson(response,"REPOSITORY_ERROR");
  }
  const repository=await get(base);
  if(typeof repository?.full_name!=="string"||repository.full_name.toLowerCase()!==(config.owner+"/"+config.repository).toLowerCase())throw new GithubError("REPOSITORY_ERROR","El repositorio no coincide con la configuración.");
  const branch=await get(base+"/branches/"+encodeURIComponent(config.branch));
  const commit=branch?.commit as {sha?:unknown}|undefined;
  if(branch?.name!==config.branch||typeof commit?.sha!=="string"||!/^[a-f0-9]{40,64}$/i.test(commit.sha))throw new GithubError("REPOSITORY_ERROR","Rama de publicación inválida.");
  const file=await get(base+"/contents/"+PUBLICATION_PATH+"?ref="+encodeURIComponent(commit.sha),true);
  if(!file)return {sha:null,json:null,branch:config.branch};
  if(file.type!=="file"||file.path!==PUBLICATION_PATH||file.encoding!=="base64"||typeof file.content!=="string"||typeof file.sha!=="string"||!/^[a-f0-9]{40,64}$/i.test(file.sha)||typeof file.size!=="number"||file.size>MAX_PUBLICATION_BYTES)throw new GithubError("REMOTE_INVALID","El archivo remoto no es una publicación compatible o supera 1 MiB.");
  try {
    const encoded=file.content.replace(/\s/g,"");
    if(!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded))throw new Error();
    const bytes=Buffer.from(encoded,"base64");if(bytes.byteLength>MAX_PUBLICATION_BYTES||bytes.byteLength!==file.size)throw new Error();
    return {sha:file.sha,json:new TextDecoder("utf-8",{fatal:true}).decode(bytes),branch:config.branch};
  } catch { throw new GithubError("REMOTE_INVALID","El contenido remoto no es UTF-8 válido."); }
}
