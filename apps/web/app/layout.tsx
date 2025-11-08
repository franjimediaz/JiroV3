import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import Providers from "./providers";
import 'bootstrap/dist/css/bootstrap.min.css';
//import 'bootstrap/dist/js/bootstrap.bundle.min.js';

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: "JiRo Web",
  description: "JiRo v2 Web Application",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
       <script
          src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"
          defer
        />
        </head>
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <Providers>
 {/* NAV SUPERIOR (con botón para abrir el sidebar en móvil) */}
    <nav className="navbar navbar-dark bg-dark">
      <div className="container-fluid">
        <button
          className="btn btn-outline-light d-lg-none"
          type="button"
          data-bs-toggle="offcanvas"
          data-bs-target="#sidebarOffcanvas"
          aria-controls="sidebarOffcanvas"
        >
          Menú
        </button>
        <a className="navbar-brand ms-lg-2" href="/">JiRo v2</a>
        <div className="d-flex align-items-center gap-2">
          <a className="btn btn-outline-light d-none d-lg-inline" href="/docs">Docs</a>
          <form action="/auth/signout" method="post" className="m-0">
            <button className="btn btn-outline-light" type="submit">Salir</button>
          </form>
        </div>
      </div>
    </nav>

    {/* LAYOUT CON SIDEBAR */}
    <div className="container-fluid layout-min-vh">
      <div className="row">
        {/* Sidebar fijo en escritorio */}
        <aside className="col-lg-2 d-none d-lg-block bg-body-tertiary border-end">
          <div className="sidebar-sticky p-3">
            <h6 className="text-uppercase text-muted mb-3">Navegación</h6>
            <ul className="nav nav-pills flex-column gap-1">
              <li className="nav-item">
                <a className="nav-link" href="/">Dashboard</a>
              </li>
              <li className="nav-item">
                <a className="nav-link" href="/customers">Clientes</a>
              </li>
              <li className="nav-item">
                <a className="nav-link" href="/system/modulos">Módulos</a>
              </li>
              <li className="nav-item">
                <a className="nav-link" href="/docs">Docs</a>
              </li>
            </ul>
          </div>
        </aside>

        {/* Sidebar como offcanvas en móvil */}
        <div
          className="offcanvas offcanvas-start"
          tabIndex={-1}
          id="sidebarOffcanvas"
          aria-labelledby="sidebarOffcanvasLabel"
        >
          <div className="offcanvas-header">
            <h5 className="offcanvas-title" id="sidebarOffcanvasLabel">Menú</h5>
            <button type="button" className="btn-close" data-bs-dismiss="offcanvas" aria-label="Close" />
          </div>
          <div className="offcanvas-body">
            <ul className="nav nav-pills flex-column gap-2">
              <li className="nav-item">
                <a className="nav-link" href="/" data-bs-dismiss="offcanvas">Dashboard</a>
              </li>
              <li className="nav-item">
                <a className="nav-link" href="/customers" data-bs-dismiss="offcanvas">Clientes</a>
              </li>
              <li className="nav-item">
                <a className="nav-link" href="/system/modulos" data-bs-dismiss="offcanvas">Módulos</a>
              </li>
              <li className="nav-item">
                <a className="nav-link" href="/docs" data-bs-dismiss="offcanvas">Docs</a>
              </li>
            </ul>
          </div>
        </div>

        {/* Contenido principal */}
        <main className="col-12 col-lg-10 p-3 p-lg-4">
          <div className="bg-white rounded shadow-sm p-3 p-lg-4">
            {children}
          </div>
          <footer className="text-center mt-4 mb-2 text-muted small">
            © {new Date().getFullYear()} JiRo v2 · Next.js + Supabase
          </footer>
        </main>
      </div>
    </div>
          
          </Providers>
      </body>
    </html>
  );
}
