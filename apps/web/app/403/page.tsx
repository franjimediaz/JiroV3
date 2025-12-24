import Link from "next/link";
import "../globals.css";
import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap-icons/font/bootstrap-icons.css";

export default function ForbiddenPage() {
  return (
    <main className="min-vh-100 d-flex align-items-center justify-content-center p-4 bg-dark">
      <div className="card text-light bg-dark border-secondary shadow-lg p-4" style={{ maxWidth: "480px" }}>
        <div className="d-flex align-items-center gap-2 mb-3">
          <div className="badge rounded-pill bg-danger bg-opacity-25 border border-danger text-danger">
            403
          </div>
          <h1 className="h4 m-0">Acceso denegado</h1>
        </div>

        <p className="text-secondary small mb-3">
          Tu sesión es válida, pero tu usuario no tiene permisos para acceder a este
          módulo o acción.
        </p>

        <ul className="text-secondary small mb-4 ps-3">
          <li>Comprueba que tu rol tenga acceso a este módulo en la configuración.</li>
          <li>Si crees que es un error, contacta con un administrador del sistema.</li>
        </ul>

        <div className="d-flex flex-wrap gap-2 justify-content-end">
          <Link href="/" className="btn btn-outline-secondary btn-sm">
            Volver al inicio
          </Link>

          <Link href="/login" className="btn btn-outline-primary btn-sm">
            Cambiar de usuario
          </Link>
        </div>
      </div>
    </main>
  );
}
