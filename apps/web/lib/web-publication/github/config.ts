import "server-only";
import { createPrivateKey } from "node:crypto";
export class GithubError extends Error {
  constructor(public code: string, message: string) { super(message); }
}
export type GithubConfig = { appId: string; privateKey: string; installationId: string; owner: string; repository: string; branch: string };
export const PUBLICATION_PATH = "apps/web-static/content/publication.json";
export function getGithubConfig(env: NodeJS.ProcessEnv = process.env): GithubConfig {
  const appId=env.GITHUB_APP_ID?.trim(), installationId=env.GITHUB_INSTALLATION_ID?.trim();
  const privateKey=env.GITHUB_APP_PRIVATE_KEY?.replace(/\\n/g,"\n");
  const owner=env.GITHUB_REPOSITORY_OWNER?.trim(), repository=env.GITHUB_REPOSITORY_NAME?.trim(), branch=env.GITHUB_PUBLICATION_BRANCH?.trim();
  if (!appId || !/^[1-9][0-9]*$/.test(appId) || !installationId || !/^[1-9][0-9]*$/.test(installationId) || !privateKey || !owner || !/^[A-Za-z0-9-]+$/.test(owner) || !repository || !/^[A-Za-z0-9_.-]+$/.test(repository) || [".",".."].includes(repository) || !branch || branch.length>255 || branch === "@" || branch.startsWith("-") || branch.startsWith("/") || branch.endsWith("/") || branch.includes("..") || branch.includes("@{") || branch.includes("//") || Array.from(branch).some(char => char.charCodeAt(0) < 33 || char.charCodeAt(0) === 127 || "~^:?*[\\".includes(char)) || branch.split("/").some(part=>part.startsWith(".") || part.endsWith(".") || part.endsWith(".lock"))) {
    throw new GithubError("CONFIG_ERROR","La configuración de GitHub App está incompleta o no es válida.");
  }
  try { if(createPrivateKey(privateKey).asymmetricKeyType!=="rsa") throw new Error(); }
  catch { throw new GithubError("CONFIG_ERROR","La clave privada de GitHub App no es una clave RSA válida."); }
  return {appId,installationId,privateKey,owner,repository,branch};
}
