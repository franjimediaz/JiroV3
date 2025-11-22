import type { ReactNode } from "react";
import { PermisosProvider } from "@/lib/perms";



export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>
        <PermisosProvider>{children}</PermisosProvider>
      </body>
    </html>
  );
}