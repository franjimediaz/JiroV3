import type { ReactNode } from "react";

/** Bootstrap class metadata becomes an icon; existing custom React icons remain valid. */
export function MenuIcon({ icon }: { icon?: ReactNode }) {
  if (typeof icon === "string" && /^(?:bi\s+)?bi-[a-z0-9-]+$/.test(icon.trim())) {
    return <i className={`bi ${icon.trim().replace(/^bi\s+/, "")}`} aria-hidden="true" />;
  }
  return <>{icon}</>;
}
