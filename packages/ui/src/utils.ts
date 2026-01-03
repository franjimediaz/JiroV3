export function isActive(pathname: string, route: string) {
  const current = normalizePath(pathname);
  const target = normalizePath(route);

  if (target === "/") return current === "/";

  // exacto
  if (current === target) return true;

  // padre: solo si el siguiente char es "/"
  return current.startsWith(target + "/");
}

function normalizePath(p: string) {
  if (!p) return "/";
  const x = p.trim().replace(/\/+$/, "");
  return x === "" ? "/" : x;
}

export function isExactActive(pathname: string, route: string) {
  const current = normalizePath(pathname);
  const target = normalizePath(route);
  return current === target;
}

export function isBranchActive(pathname: string, route: string) {
  const current = normalizePath(pathname);
  const target = normalizePath(route);
  if (target === "/") return current === "/";
  return current === target || current.startsWith(target + "/");
}