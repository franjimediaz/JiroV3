import type { ReactNode } from "react";
import { PermisosProvider } from "@/lib/perms";
import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap-icons/font/bootstrap-icons.css";



export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>
        <PermisosProvider>{children}</PermisosProvider>
      </body>
    </html>
  );
}