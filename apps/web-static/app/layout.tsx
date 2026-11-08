import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import "@repo/web-components/styles.css";

export const metadata: Metadata = {
  title: "Jiro Web Static",
  description: "Generador de páginas web estáticas de Jiro V3.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
