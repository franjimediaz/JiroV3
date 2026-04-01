import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type ModuleRow = {
  id: string;
  slug: string;
  nombre: string;
  route: string | null;
  activo: boolean | null;
  orden: number | null;
  parent_id: string | null;
  props: any;
};

async function countTable(supabase: any, table: string) {
  const { count, error } = await supabase.from(table).select("id", { count: "exact", head: true });
  if (error) return null;
  return typeof count === "number" ? count : null;
}

function initials(email?: string | null) {
  if (!email) return "U";
  const left = email.split("@")[0] || "u";
  const parts = left.split(/[._-]+/).filter(Boolean);
  return `${(parts[0]?.[0] || left[0] || "u").toUpperCase()}${(parts[1]?.[0] || "").toUpperCase()}` || "U";
}

function formatNumber(value: number | null) {
  if (value === null) return "—";
  return new Intl.NumberFormat("es-ES").format(value);
}

function safeProps(raw: any) {
  try {
    if (!raw) return {};
    if (typeof raw === "string") return JSON.parse(raw);
    return typeof raw === "object" ? raw : {};
  } catch {
    return {};
  }
}

function resolveTable(row: ModuleRow) {
  return safeProps(row.props)?.db?.table || row.slug;
}

function resolveColor(row: ModuleRow) {
  return safeProps(row.props)?.ui?.color || "#2563eb";
}

function resolveIcon(row: ModuleRow) {
  return safeProps(row.props)?.ui?.icon || "bi bi-grid-1x2";
}

function featuredConfig(row: ModuleRow) {
  const props = safeProps(row.props);
  const ui = props?.ui || {};
  const home = ui?.home || {};
  const dashboard = ui?.dashboard || {};
  const featured =
    home?.featured === true ||
    dashboard?.featured === true ||
    ui?.featuredOnHome === true;
  const order = Number(home?.order ?? dashboard?.order ?? ui?.featuredOrder ?? Number.POSITIVE_INFINITY);
  return { featured, order };
}

function rgbaFromHex(hex: string, alpha: number) {
  const clean = hex.replace("#", "");
  if (clean.length !== 6) return `rgba(37,99,235,${alpha})`;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function textColorOn(hex: string) {
  const clean = hex.replace("#", "");
  if (clean.length !== 6) return "#0f172a";
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.6 ? "#0f172a" : "#f8fafc";
}

function moduleHref(row: ModuleRow, isSystem: boolean) {
  if (!isSystem) return `/m/${row.slug}`;
  if (row.slug === "modulos") return "/system/modulos";
  if (row.slug === "rol") return "/system/rol";
  if (row.slug === "pdf-templates") return "/system/pdf-templates";
  return row.route || `/system/${row.slug}`;
}

function renderModuleIcon(icon: string, fg: string) {
  return icon.startsWith("bi ") ? <i className={icon} style={{ color: fg, fontSize: 20 }} /> : <span style={{ color: fg, fontSize: 20 }}>{icon}</span>;
}

function buildSystemSet(rows: ModuleRow[]) {
  const root = rows.find((row) => row.slug === "system");
  const out = new Set<string>();
  if (!root) return out;
  const visit = (id: string) => {
    if (out.has(id)) return;
    out.add(id);
    rows.filter((row) => row.parent_id === id).forEach((row) => visit(row.id));
  };
  visit(root.id);
  return out;
}

export default async function Home() {
  const supabase = await createClient();
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session?.user) redirect("/login");

  const user = session.user;
  const email = user.email ?? "—";
  const role = (user.user_metadata as any)?.role ?? user.role ?? "—";

  const { data } = await supabase
    .from("modulos")
    .select("id,slug,nombre,route,activo,orden,parent_id,props")
    .eq("activo", true)
    .order("orden", { ascending: true })
    .order("nombre", { ascending: true });

  const modules = ((data || []) as ModuleRow[]).filter((row) => row.slug !== "system");
  const systemSet = buildSystemSet((data || []) as ModuleRow[]);
  const businessModules = modules.filter((row) => !systemSet.has(row.id));
  const systemModules = modules.filter((row) => systemSet.has(row.id));
  const configuredFeatured = businessModules
    .filter((row) => featuredConfig(row).featured)
    .sort((a, b) => featuredConfig(a).order - featuredConfig(b).order || (a.orden ?? 9999) - (b.orden ?? 9999));
  const featuredBusiness = (configuredFeatured.length ? configuredFeatured : businessModules).slice(0, 4);
  const trackedBusiness = [...new Map([...featuredBusiness, ...businessModules].slice(0, 6).map((row) => [row.slug, row])).values()];

  const counts = await Promise.all(
    trackedBusiness.map(async (row) => ({ slug: row.slug, count: await countTable(supabase, resolveTable(row)) }))
  );
  const countsBySlug = Object.fromEntries(counts.map((item) => [item.slug, item.count])) as Record<string, number | null>;

  const featuredCards = featuredBusiness.map((row) => {
    const color = resolveColor(row);
    return {
      row,
      color,
      fg: textColorOn(color),
      count: countsBySlug[row.slug] ?? null,
    };
  });

  const systemShortcuts = systemModules
    .filter((row) => ["modulos", "rol", "pdf-templates"].includes(row.slug))
    .slice(0, 3);

  const totalBusinessRows = counts.reduce((acc, item) => acc + (item.count ?? 0), 0);
  const coverage = counts.filter((item) => item.count !== null).length;
  const topCard = [...featuredCards].sort((a, b) => (b.count ?? -1) - (a.count ?? -1))[0];

  const heroStats = [
    { label: "Módulos negocio", value: businessModules.length, note: "rutas m/<slug>" },
    { label: "Registros", value: totalBusinessRows, note: "datos monitorizados" },
    { label: "Cobertura", value: `${coverage}/${trackedBusiness.length || 0}`, note: "tablas contadas" },
  ];

  const metricCards = [
    { label: "Negocio", value: businessModules.length, note: "módulos operativos", accent: "#0f766e", icon: "bi bi-briefcase-fill" },
    { label: "Sistema", value: systemModules.length, note: "configuración interna", accent: "#7c3aed", icon: "bi bi-sliders2-vertical" },
    { label: "Registros", value: totalBusinessRows, note: "suma de tablas reales", accent: "#ea580c", icon: "bi bi-bar-chart-line-fill" },
    { label: "Top módulo", value: topCard?.count ?? null, note: topCard?.row.nombre || "sin datos", accent: "#2563eb", icon: "bi bi-stars" },
  ];

  const workspaceItems = [
    { label: "Acceso", value: "Activo", color: "#16a34a" },
    { label: "Rol", value: String(role), color: "#2563eb" },
    { label: "Módulos", value: `${businessModules.length + systemModules.length}`, color: "#7c3aed" },
  ];

  const statusItems = [
    { title: "Principal", value: topCard?.row.nombre || "—", desc: topCard ? `${formatNumber(topCard.count)} registros en ${resolveTable(topCard.row)}.` : "Sin datos de conteo." },
    { title: "Cobertura", value: `${coverage}/${trackedBusiness.length || 0}`, desc: "Tablas de negocio resueltas correctamente." },
    { title: "Perfil", value: user.email_confirmed_at ? "Verificado" : "Pendiente", desc: "Estado actual de la cuenta." },
  ];

  return (
    <main style={{ minHeight: "100vh", background: "radial-gradient(1200px 580px at 0% 0%, rgba(14,165,233,.16), transparent 52%),radial-gradient(960px 520px at 100% 0%, rgba(249,115,22,.14), transparent 44%),linear-gradient(180deg, #f8fafc 0%, #edf4ff 46%, #f8fafc 100%)", color: "#0f172a" }}>
      <style>{`
        @keyframes dashboardFadeUp {
          from { opacity: 0; transform: translateY(18px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes dashboardGlow {
          0%, 100% { transform: scale(1); opacity: .9; }
          50% { transform: scale(1.04); opacity: 1; }
        }
        .dash-anim {
          opacity: 0;
          animation: dashboardFadeUp .65s ease forwards;
          will-change: transform, opacity;
        }
        .dash-delay-1 { animation-delay: .04s; }
        .dash-delay-2 { animation-delay: .12s; }
        .dash-delay-3 { animation-delay: .20s; }
        .dash-delay-4 { animation-delay: .28s; }
        .dash-hover {
          transition: transform .22s ease, box-shadow .22s ease, border-color .22s ease, background .22s ease;
          will-change: transform;
        }
        .dash-hover:hover {
          transform: translateY(-6px);
          box-shadow: 0 28px 60px rgba(15,23,42,.12) !important;
        }
        .dash-link-hover {
          transition: transform .2s ease, opacity .2s ease;
        }
        .dash-link-hover:hover {
          transform: translateX(4px);
        }
        .dash-orb {
          animation: dashboardGlow 9s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .dash-anim, .dash-orb {
            opacity: 1;
            animation: none !important;
          }
          .dash-hover, .dash-link-hover {
            transition: none !important;
          }
          .dash-hover:hover, .dash-link-hover:hover {
            transform: none !important;
          }
        }
      `}</style>
      <div className="container-fluid py-4 py-xl-5" style={{ maxWidth: 1380 }}>
        <section className="dash-anim" style={{ position: "relative", overflow: "hidden", borderRadius: 32, background: "linear-gradient(135deg, rgba(15,23,42,.98), rgba(30,41,59,.95) 44%, rgba(2,132,199,.94) 100%)", color: "#f8fafc", boxShadow: "0 30px 90px rgba(15,23,42,.22)" }}>
          <div className="dash-orb" style={{ position: "absolute", inset: "auto auto -90px -80px", width: 300, height: 300, borderRadius: "50%", background: "radial-gradient(circle, rgba(34,211,238,.34), transparent 68%)" }} />
          <div className="dash-orb" style={{ position: "absolute", inset: "-60px -40px auto auto", width: 360, height: 360, borderRadius: "50%", background: "radial-gradient(circle, rgba(251,146,60,.22), transparent 70%)", animationDelay: "-4.5s" }} />
          <div className="row g-0">
            <div className="col-12 col-xl-8">
              <div className="p-4 p-md-5">
                <div style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "9px 15px", borderRadius: 999, border: "1px solid rgba(255,255,255,.12)", background: "rgba(255,255,255,.06)", fontSize: 12, letterSpacing: ".16em", textTransform: "uppercase", color: "rgba(226,232,240,.96)" }}>
                  <span className="rounded-circle" style={{ width: 8, height: 8, background: "#22c55e" }} />
                  Dashboard Premium
                </div>
                <h1 className="mt-4 mb-3" style={{ fontSize: "clamp(2.3rem, 4.4vw, 4.4rem)", lineHeight: 0.98, fontWeight: 900 }}>
                  Todo el proyecto en una portada con datos reales.
                </h1>
                <p className="mb-4" style={{ maxWidth: 760, color: "rgba(226,232,240,.76)", fontSize: 17 }}>
                  Accesos directos a módulos de negocio por <code>m/&lt;slug&gt;</code>, módulos system aparte y métricas tomadas de tablas reales.
                </p>
                <div className="d-flex flex-wrap gap-2 gap-md-3">
                  {featuredCards[0] && (
                    <Link href={moduleHref(featuredCards[0].row, false)} style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "13px 18px", borderRadius: 16, textDecoration: "none", color: "#eff6ff", fontWeight: 800, background: "linear-gradient(135deg, #2563eb, #0ea5e9)", border: "1px solid rgba(96,165,250,.24)", boxShadow: "0 16px 28px rgba(37,99,235,.24)" }}>
                      <i className="bi bi-rocket-takeoff-fill" />
                      Abrir {featuredCards[0].row.nombre}
                    </Link>
                  )}
                  <Link href="/system/modulos" style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "13px 18px", borderRadius: 16, textDecoration: "none", color: "#f8fafc", fontWeight: 800, background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.12)" }}>
                    <i className="bi bi-diagram-3-fill" />
                    Administrar módulos
                  </Link>
                </div>
                <div className="d-flex flex-wrap gap-3 mt-4 mt-xl-5">
                  {heroStats.map((item) => (
                    <div key={item.label} style={{ minWidth: 170, borderRadius: 22, padding: "18px 18px 16px", background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.10)" }}>
                      <div className="small mb-2" style={{ color: "rgba(226,232,240,.72)" }}>{item.label}</div>
                      <div style={{ fontSize: 34, fontWeight: 900, lineHeight: 1 }}>{typeof item.value === "number" ? formatNumber(item.value) : item.value}</div>
                      <div className="small mt-2" style={{ color: "rgba(255,255,255,.64)" }}>{item.note}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="col-12 col-xl-4">
              <div className="h-100 p-4 p-md-5" style={{ background: "rgba(255,255,255,.05)", borderLeft: "1px solid rgba(255,255,255,.08)" }}>
                <div className="d-flex align-items-start justify-content-between gap-3 mb-4">
                  <div style={{ width: 78, height: 78, borderRadius: 24, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 24, letterSpacing: ".08em", background: "linear-gradient(135deg, rgba(56,189,248,.24), rgba(251,146,60,.24))", border: "1px solid rgba(255,255,255,.14)" }}>{initials(user.email)}</div>
                  <form action="/auth/signout" method="post" className="m-0">
                    <button type="submit" className="btn" style={{ borderRadius: 14, border: "1px solid rgba(255,255,255,.14)", color: "#f8fafc", background: "rgba(255,255,255,.06)", padding: "10px 14px", fontWeight: 700 }}>
                      <i className="bi bi-box-arrow-right me-2" />
                      Salir
                    </button>
                  </form>
                </div>
                <div className="mb-2" style={{ fontSize: 13, letterSpacing: ".14em", textTransform: "uppercase", color: "rgba(255,255,255,.52)" }}>Sesión activa</div>
                <div style={{ fontSize: 26, fontWeight: 900, lineHeight: 1.2, wordBreak: "break-word" }}>{email}</div>
                <div className="mt-2" style={{ color: "rgba(226,232,240,.74)" }}>Rol actual: <span style={{ color: "#fff", fontWeight: 800 }}>{String(role)}</span></div>
                <div className="d-flex flex-column gap-2 mt-4">
                  {workspaceItems.map((item) => (
                    <div key={item.label} className="d-flex align-items-center justify-content-between" style={{ padding: "12px 14px", borderRadius: 16, background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.08)" }}>
                      <div className="d-flex align-items-center gap-2">
                        <span style={{ width: 10, height: 10, borderRadius: 999, background: item.color, boxShadow: `0 0 0 6px ${rgbaFromHex(item.color, 0.18)}`, display: "inline-block" }} />
                        <span style={{ color: "rgba(255,255,255,.76)" }}>{item.label}</span>
                      </div>
                      <span style={{ color: "#fff", fontWeight: 800 }}>{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="row g-3 mt-1 mb-4">
          {metricCards.map((metric) => (
            <div className="col-12 col-sm-6 col-xl-3" key={metric.label}>
              <article className="dash-anim dash-hover dash-delay-1" style={{ height: "100%", borderRadius: 26, padding: 24, background: `linear-gradient(180deg, rgba(255,255,255,.92), ${rgbaFromHex(metric.accent, 0.12)})`, border: `1px solid ${rgbaFromHex(metric.accent, 0.16)}`, boxShadow: "0 18px 45px rgba(15,23,42,.08)" }}>
                <div className="d-flex align-items-start justify-content-between gap-3 mb-4">
                  <div>
                    <div className="small mb-2" style={{ color: "#64748b" }}>{metric.label}</div>
                    <div style={{ fontSize: 40, lineHeight: 1, fontWeight: 900, color: "#0f172a" }}>{typeof metric.value === "number" ? formatNumber(metric.value) : metric.value}</div>
                  </div>
                  <div className="d-flex align-items-center justify-content-center" style={{ width: 52, height: 52, borderRadius: 18, background: "rgba(255,255,255,.82)", border: `1px solid ${rgbaFromHex(metric.accent, 0.18)}`, color: metric.accent }}>
                    <i className={metric.icon} />
                  </div>
                </div>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 8, borderRadius: 999, padding: "8px 12px", background: "rgba(255,255,255,.7)", border: "1px solid rgba(148,163,184,.14)", color: metric.accent, fontWeight: 700, fontSize: 13 }}>
                  <i className="bi bi-stars" />
                  {metric.note}
                </div>
              </article>
            </div>
          ))}
        </section>

        <section className="row g-3">
          <div className="col-12 col-xl-8">
            <div className="dash-anim dash-delay-2" style={{ borderRadius: 28, background: "rgba(255,255,255,.84)", border: "1px solid rgba(148,163,184,.18)", boxShadow: "0 20px 50px rgba(15,23,42,.07)", padding: 26 }}>
              <div className="d-flex flex-column flex-lg-row align-items-start align-items-lg-center justify-content-between gap-3 mb-4">
                <div>
                  <div className="small text-uppercase mb-2" style={{ letterSpacing: ".14em", color: "#64748b" }}>Módulos de negocio</div>
                  <h2 className="h3 mb-1" style={{ fontWeight: 900 }}>Accesos reales del workspace</h2>
                  <p className="mb-0" style={{ color: "#64748b" }}>
                    Todo este bloque navega a rutas reales <code>m/&lt;slug&gt;</code>.
                    {configuredFeatured.length > 0 ? " Los destacados se están leyendo desde la configuración del módulo." : " Se usan los primeros módulos activos como fallback."}
                  </p>
                </div>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8, borderRadius: 999, padding: "8px 12px", background: "rgba(37,99,235,.08)", border: "1px solid rgba(37,99,235,.12)", color: "#1d4ed8", fontWeight: 700, fontSize: 13 }}>
                  <i className="bi bi-lightning-charge-fill" />
                  {featuredCards.length} destacados
                </span>
              </div>
              <div className="row g-3">
                {featuredCards.map((card) => (
                  <div className="col-12 col-md-6" key={card.row.slug}>
                    <Link href={moduleHref(card.row, false)} className="text-decoration-none">
                      <div className="h-100 dash-hover" style={{ borderRadius: 24, padding: 22, background: `linear-gradient(180deg, rgba(255,255,255,.96), ${rgbaFromHex(card.color, 0.14)})`, border: `1px solid ${rgbaFromHex(card.color, 0.16)}`, boxShadow: "inset 0 1px 0 rgba(255,255,255,.75)" }}>
                        <div className="d-flex align-items-start justify-content-between gap-3 mb-4">
                          <div>
                            <div className="mb-2" style={{ color: "#0f172a", fontSize: 21, fontWeight: 900 }}>{card.row.nombre}</div>
                            <div style={{ color: "#64748b", fontSize: 14 }}>Tabla: {resolveTable(card.row)}</div>
                          </div>
                          <div className="d-flex align-items-center justify-content-center" style={{ width: 52, height: 52, borderRadius: 18, background: card.color, boxShadow: `0 16px 28px ${rgbaFromHex(card.color, 0.22)}` }}>
                            {renderModuleIcon(resolveIcon(card.row), card.fg)}
                          </div>
                        </div>
                        <div className="d-flex align-items-end justify-content-between gap-3">
                          <div>
                            <div style={{ fontSize: 34, lineHeight: 1, color: "#0f172a", fontWeight: 900 }}>{formatNumber(card.count)}</div>
                            <div className="small mt-2" style={{ color: "#64748b" }}>registros monitorizados</div>
                          </div>
                          <div className="small dash-link-hover" style={{ color: card.color, fontWeight: 800 }}>Abrir módulo <i className="bi bi-arrow-up-right ms-1" /></div>
                        </div>
                      </div>
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="col-12 col-xl-4">
            <div className="dash-anim dash-delay-3" style={{ borderRadius: 28, background: "rgba(255,255,255,.84)", border: "1px solid rgba(148,163,184,.18)", boxShadow: "0 20px 50px rgba(15,23,42,.07)", padding: 24, marginBottom: 16 }}>
              <div className="d-flex align-items-center justify-content-between mb-3">
                <h2 className="h5 m-0" style={{ fontWeight: 900 }}>Accesos de system</h2>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8, borderRadius: 999, padding: "7px 11px", background: "rgba(124,58,237,.08)", border: "1px solid rgba(124,58,237,.12)", color: "#7c3aed", fontWeight: 700, fontSize: 12 }}>
                  <i className="bi bi-shield-lock" />
                  System
                </span>
              </div>
              <div className="d-flex flex-column gap-2">
                {systemShortcuts.map((row) => (
                  <Link key={row.slug} href={moduleHref(row, true)} className="text-decoration-none dash-hover" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, padding: "14px 16px", borderRadius: 18, background: "linear-gradient(135deg, #faf5ff, #f5f3ff)", border: "1px solid rgba(124,58,237,.10)", color: "#0f172a" }}>
                    <div className="d-flex align-items-center gap-3">
                      <div className="d-flex align-items-center justify-content-center" style={{ width: 42, height: 42, borderRadius: 14, background: rgbaFromHex(resolveColor(row), 0.14) }}>
                        {renderModuleIcon(resolveIcon(row), resolveColor(row))}
                      </div>
                      <span style={{ fontWeight: 800 }}>{row.nombre}</span>
                    </div>
                    <i className="bi bi-arrow-right" style={{ color: resolveColor(row) }} />
                  </Link>
                ))}
              </div>
            </div>

            <div className="dash-anim dash-delay-4" style={{ borderRadius: 28, background: "rgba(255,255,255,.84)", border: "1px solid rgba(148,163,184,.18)", boxShadow: "0 20px 50px rgba(15,23,42,.07)", padding: 24, marginBottom: 16 }}>
              <div className="d-flex align-items-center justify-content-between mb-3">
                <h2 className="h5 m-0" style={{ fontWeight: 900 }}>Perfil rápido</h2>
                <i className="bi bi-person-badge" style={{ color: "#2563eb" }} />
              </div>
              <div className="d-flex flex-column gap-3">
                <div style={{ borderRadius: 18, padding: 16, background: "linear-gradient(135deg, #f8fafc, #eef2ff)", border: "1px solid rgba(148,163,184,.18)" }}>
                  <div className="small mb-1" style={{ color: "#64748b" }}>Email</div>
                  <div style={{ color: "#0f172a", fontWeight: 800, wordBreak: "break-word" }}>{email}</div>
                </div>
                <div style={{ borderRadius: 18, padding: 16, background: "linear-gradient(135deg, #fff7ed, #ffedd5)", border: "1px solid rgba(251,146,60,.18)" }}>
                  <div className="small mb-1" style={{ color: "#64748b" }}>Rol</div>
                  <div style={{ color: "#9a3412", fontWeight: 900 }}>{String(role)}</div>
                </div>
              </div>
              <div className="mt-4">
                <div className="small mb-2" style={{ color: "#64748b" }}>Metadata</div>
                <pre className="mb-0 p-3" style={{ background: "linear-gradient(180deg, rgba(15,23,42,.04), rgba(15,23,42,.02))", border: "1px solid rgba(148,163,184,.18)", borderRadius: 18, color: "#0f172a", fontSize: 12, whiteSpace: "pre-wrap", overflow: "auto", maxHeight: 220 }}>
                  {JSON.stringify(user.user_metadata || {}, null, 2)}
                </pre>
              </div>
            </div>

            <div className="dash-anim dash-delay-4" style={{ borderRadius: 28, background: "rgba(255,255,255,.84)", border: "1px solid rgba(148,163,184,.18)", boxShadow: "0 20px 50px rgba(15,23,42,.07)", padding: 24 }}>
              <div className="d-flex align-items-center justify-content-between mb-3">
                <h2 className="h5 m-0" style={{ fontWeight: 900 }}>Estado del workspace</h2>
                <i className="bi bi-activity" style={{ color: "#2563eb" }} />
              </div>
              <div className="d-flex flex-column gap-3">
                {statusItems.map((item) => (
                  <div key={item.title} style={{ borderRadius: 18, padding: 16, background: "rgba(248,250,252,.92)", border: "1px solid rgba(148,163,184,.14)" }}>
                    <div className="d-flex align-items-center justify-content-between gap-3 mb-1">
                      <div style={{ color: "#0f172a", fontWeight: 800 }}>{item.title}</div>
                      <div style={{ color: "#2563eb", fontWeight: 900 }}>{item.value}</div>
                    </div>
                    <div className="small" style={{ color: "#64748b" }}>{item.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <footer className="mt-4 pt-2 small" style={{ color: "#94a3b8" }}>
          © {new Date().getFullYear()} JiRo v3 · Inicio conectado a módulos reales
        </footer>
      </div>
    </main>
  );
}
