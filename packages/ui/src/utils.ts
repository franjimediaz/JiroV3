export function isActive(pathname: string, route?: string) {
  if (!route) return false;
  if (route === "/") return pathname === "/";
  return pathname === route || pathname.startsWith(route + "/");
}