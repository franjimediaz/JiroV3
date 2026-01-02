// apps/web/app/page.tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function countTable(supabase: any, table: string) {
  const { count, error } = await supabase.from(table).select("id", { count: "exact", head: true });
  if (error) return null;
  return typeof count === "number" ? count : null;
}

function initials(email?: string | null) {
  if (!email) return "U";
  const left = email.split("@")[0] || "u";
  const parts = left.split(/[._-]+/).filter(Boolean);
  const a = (parts[0]?.[0] || left[0] || "u").toUpperCase();
  const b = (parts[1]?.[0] || "").toUpperCase();
  return (a + b) || "U";
}

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error || !session?.user) redirect("/login");

  const user = session.user;
  const email = user.email ?? "—";
  const role = (user.user_metadata as any)?.role ?? user.role ?? "—";

  // KPIs (ajusta tablas si en tu DB se llaman distinto)
  const [customersCount, usersCount, modulosCount] = await Promise.all([
    countTable(supabase, "customers"),
    countTable(supabase, "users"),
    countTable(supabase, "modulos"),
  ]);

  const kpis = [
    { label: "Customers", value: customersCount, icon: "bi-people", href: "/customers" },
    { label: "Usuarios", value: usersCount, icon: "bi-person-badge", href: "/users" },
    { label: "Módulos", value: modulosCount, icon: "bi-grid-1x2", href: "/system/modulos" },
    { label: "Sesión", value: 1, icon: "bi-shield-check", href: "/my-profile" },
  ];

  const s: Record<string, React.CSSProperties | ((c: string) => React.CSSProperties)> = {
    page: {
      minHeight: "100vh",
      background:
        "radial-gradient(900px 500px at 15% 10%, rgba(59,130,246,.10), transparent 60%)," +
        "radial-gradient(900px 500px at 85% 15%, rgba(16,185,129,.10), transparent 55%)," +
        "linear-gradient(180deg, #f8fafc 0%, #f1f5f9 70%, #eef2f7 100%)",
      color: "#0f172a",
    },
    card: {
      background: "rgba(255,255,255,.85)",
      border: "1px solid rgba(15, 23, 42, .08)",
      boxShadow: "0 10px 30px rgba(15,23,42,.06)",
      borderRadius: 18,
    },
    muted: { color: "#64748b" },
    title: { color: "#0f172a" },
    pill: {
      border: "1px solid rgba(15, 23, 42, .10)",
      background: "rgba(255,255,255,.70)",
      color: "#0f172a",
    },
    btnSoft: {
      border: "1px solid rgba(15, 23, 42, .12)",
      background: "rgba(255,255,255,.80)",
      color: "#0f172a",
      borderRadius: 12,
    },
    btnPrimary: {
      border: "1px solid rgba(59,130,246,.30)",
      background: "linear-gradient(135deg, rgba(59,130,246,.95), rgba(37,99,235,.95))",
      color: "white",
      borderRadius: 12,
    },
    hero: {
      borderRadius: 22,
      border: "1px solid rgba(15, 23, 42, .10)",
      background: "linear-gradient(135deg, rgba(255,255,255,.85), rgba(255,255,255,.65))",
      boxShadow: "0 18px 60px rgba(15,23,42,.10)",
      backdropFilter: "blur(10px)",
    },
    badgeDot: (c: string) => ({
      width: 8,
      height: 8,
      borderRadius: 999,
      background: c,
      display: "inline-block",
    }),
  };

  return (
    <main style={s.page as React.CSSProperties}>
      <div className="container-fluid py-4" style={{ maxWidth: 1200 }}>
        {/* HERO */}
        <section className="p-4 p-md-5 mb-4" style={s.hero as React.CSSProperties}>
          <div className="d-flex flex-column flex-md-row gap-4 align-items-start align-items-md-center justify-content-between">
            <div>
              <div className="text-uppercase small" style={{ ...(s.muted as React.CSSProperties), letterSpacing: 1 }}>
                JiRo v2 · Panel principal
              </div>

              <h1 className="h3 mt-2 mb-2" style={s.title as React.CSSProperties}>
                Hola, <span className="fw-bold">{email}</span>
              </h1>

              <div className="d-flex flex-wrap gap-2 align-items-center">
                <span className="badge rounded-pill px-3 py-2" style={s.pill as React.CSSProperties}>
                  <span style={(s.badgeDot as any)("rgba(16,185,129,.95)")} className="me-2" />
                  Sesión activa
                </span>

                <span className="badge rounded-pill px-3 py-2" style={s.pill as React.CSSProperties}>
                  <i className="bi bi-person-gear me-2" />
                  Rol: <span className="fw-semibold">{String(role)}</span>
                </span>
              </div>

              <div className="mt-3" style={s.muted as React.CSSProperties}>
                Accede rápido a lo importante y revisa métricas básicas de tu app.
              </div>
            </div>

            <div className="d-flex align-items-center gap-3">
              <div
                className="d-flex align-items-center justify-content-center"
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 16,
                  background: "linear-gradient(135deg, rgba(59,130,246,.20), rgba(16,185,129,.18))",
                  border: "1px solid rgba(15,23,42,.10)",
                  color: "#0f172a",
                  fontWeight: 800,
                  letterSpacing: 1,
                }}
                title={email}
              >
                {initials(user.email)}
              </div>

              <form action="/auth/signout" method="post" className="m-0">
                <button type="submit" className="btn px-3 py-2" style={s.btnSoft as React.CSSProperties}>
                  <i className="bi bi-box-arrow-right me-2" />
                  Salir
                </button>
              </form>
            </div>
          </div>
        </section>

        {/* KPIs */}
        <section className="row g-3 mb-4">
          {kpis.map((k) => (
            <div className="col-12 col-sm-6 col-lg-3" key={k.label}>
              <Link href={k.href} className="text-decoration-none">
                <div className="p-4 h-100" style={s.card as React.CSSProperties}>
                  <div className="d-flex align-items-center justify-content-between mb-2">
                    <div className="small" style={s.muted as React.CSSProperties}>
                      {k.label}
                    </div>

                    <div
                      className="d-flex align-items-center justify-content-center"
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 12,
                        background: "rgba(59,130,246,.10)",
                        border: "1px solid rgba(59,130,246,.15)",
                        color: "#1d4ed8",
                      }}
                    >
                      <i className={`bi ${k.icon}`} />
                    </div>
                  </div>

                  <div className="d-flex align-items-end gap-2">
                    <div className="display-6" style={{ fontWeight: 800, color: "#0f172a" }}>
                      {k.value === null ? "—" : k.value}
                    </div>
                    <div className="mb-2 small" style={s.muted as React.CSSProperties}>
                      total
                    </div>
                  </div>

                  <div className="mt-2 small" style={s.muted as React.CSSProperties}>
                    Ver detalle <i className="bi bi-arrow-right ms-1" />
                  </div>
                </div>
              </Link>
            </div>
          ))}
        </section>

        {/* LAYOUT 2 COLS */}
        <section className="row g-3">
          {/* Quick actions */}
          <div className="col-12 col-lg-7">
            <div className="p-4" style={s.card as React.CSSProperties}>
              <div className="d-flex align-items-center justify-content-between mb-3">
                <h2 className="h5 m-0" style={s.title as React.CSSProperties}>
                  Acciones rápidas
                </h2>
                <span className="badge rounded-pill px-3 py-2" style={s.pill as React.CSSProperties}>
                  <i className="bi bi-lightning-charge me-2" />
                  Atajos
                </span>
              </div>

              <div className="d-flex flex-wrap gap-2">
                <Link href="/customers" className="btn px-3 py-2" style={s.btnPrimary as React.CSSProperties}>
                  <i className="bi bi-people me-2" />
                  Customers
                </Link>

                <Link href="/system/modulos" className="btn px-3 py-2" style={s.btnSoft as React.CSSProperties}>
                  <i className="bi bi-grid-1x2 me-2" />
                  Módulos
                </Link>

                <Link href="/users" className="btn px-3 py-2" style={s.btnSoft as React.CSSProperties}>
                  <i className="bi bi-person-badge me-2" />
                  Usuarios
                </Link>

                <Link href="/system" className="btn px-3 py-2" style={s.btnSoft as React.CSSProperties}>
                  <i className="bi bi-gear me-2" />
                  System
                </Link>
              </div>

              <hr className="my-4" />

              {/* ✅ BLOQUE CON TU SUGERENCIA (tal cual) */}
              <div className="d-flex gap-3">
         
                <div>

                </div>
              </div>
            </div>
          </div>

          {/* Right side: session + activity placeholder */}
          <div className="col-12 col-lg-5">
            <div className="p-4 mb-3" style={s.card as React.CSSProperties}>
              <h2 className="h5 mb-3" style={s.title as React.CSSProperties}>
                Perfil rápido
              </h2>

              <div className="d-flex align-items-center justify-content-between mb-2">
                <div className="small" style={s.muted as React.CSSProperties}>
                  Email
                </div>
                <div className="fw-semibold" style={{ color: "#0f172a" }}>
                  {email}
                </div>
              </div>

              <div className="d-flex align-items-center justify-content-between mb-3">
                <div className="small" style={s.muted as React.CSSProperties}>
                  Rol
                </div>
                <div className="fw-semibold" style={{ color: "#0f172a" }}>
                  {String(role)}
                </div>
              </div>

              <div className="small" style={s.muted as React.CSSProperties}>
                Metadata
              </div>
              <pre
                className="mt-2 mb-0 p-3"
                style={{
                  background: "rgba(15,23,42,.04)",
                  border: "1px solid rgba(15,23,42,.08)",
                  borderRadius: 14,
                  color: "#0f172a",
                  fontSize: 12,
                  whiteSpace: "pre-wrap",
                  overflow: "auto",
                  maxHeight: 220,
                }}
              >
                {JSON.stringify(user.user_metadata || {}, null, 2)}
              </pre>
            </div>

            <div className="p-4" style={s.card as React.CSSProperties}>
              <h2 className="h5 mb-2" style={s.title as React.CSSProperties}>
                Actividad (próximamente)
              </h2>
              <div className="small" style={s.muted as React.CSSProperties}>
                Aquí podemos mostrar:
                <ul className="mt-2 mb-0">
                  <li>Últimos 5 customers creados/modificados</li>
                  <li>Módulos recién cambiados</li>
                  <li>Alertas (tablas sin schema, permisos incompletos, etc.)</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        <footer className="mt-4 small" style={{ color: "#94a3b8" }}>
          © {new Date().getFullYear()} JiRo v2 · Dashboard
        </footer>
      </div>
    </main>
  );
}
