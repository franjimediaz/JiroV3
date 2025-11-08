export default function DocsEstadoActual() {
  const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <section style={{ marginBottom: 32 }}>
      <h2 style={{ fontSize: 22, marginBottom: 8 }}>{title}</h2>
      <div style={{ lineHeight: 1.6 }}>{children}</div>
    </section>
  );

  const Code: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <pre style={{ background: "#0f172a", color: "#e5e7eb", padding: 16, borderRadius: 10, overflowX: "auto" }}>
      <code>{children}</code>
    </pre>
  );

  const Small = (p: any) => <small style={{ color: "#475569" }} {...p} />;

  return (
    <main style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
      <h1 style={{ fontSize: 32, marginBottom: 16 }}>JiRo v2 · Documentación de Estado Actual</h1>
      <p style={{ marginBottom: 24 }}>
        Este documento describe el estado actual del proyecto <b>JiRo v2</b>, centrado en la migración a <b>Supabase</b> y la base de la nueva arquitectura con Next.js (App Router).
        <br />
        <Small>Última revisión: 8 de noviembre de 2025</Small>
      </p>

      <Section title="1) Stack actual">
        <ul>
          <li><b>Framework:</b> Next.js 14 con App Router y TypeScript.</li>
          <li><b>Base de datos y autenticación:</b> Supabase (PostgreSQL + Auth).</li>
          <li><b>Gestión del proyecto:</b> Turborepo (estructura apps/web).</li>
          <li><b>Estilos:</b> CSS global y módulos CSS básicos. Sin uso de Tailwind.</li>
        </ul>
      </Section>

      <Section title="2) Autenticación con Supabase">
        <p>
          El sistema de login y logout ya está operativo. Se utiliza el cliente del servidor (<code>lib/supabase/server.ts</code>) para obtener el usuario en páginas <b>SSR</b>.
          Se ha corregido el uso de APIs obsoletas y el manejo de cookies en el lado del servidor.
        </p>
        <Code>{`
// app/page.tsx (extracto funcional)
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <main style={{ padding: 24 }}>
      <h1>Dashboard</h1>
      <p>Hola {user?.email}</p>
      <form action="/auth/signout" method="post">
        <button>Salir</button>
      </form>
    </main>
  );
}
        `}</Code>
        <ul>
          <li>Se añadió cliente separado para navegador y servidor en <code>lib/supabase/</code>.</li>
          <li>Inicio de sesión validado y funcional.</li>
          <li>Pendiente: middleware SSR para proteger rutas según sesión.</li>
        </ul>
      </Section>

      <Section title="3) Ruteo y estructura de páginas">
        <p>
          JiRo v2 utiliza el App Router de Next.js con rutas <b>dinámicas</b> y páginas unificadas para ver, editar y crear.
          Se ha corregido el error típico de Next 14: <code>params</code> y <code>searchParams</code> son promesas en componentes <i>async</i>.
        </p>
        <Code>{`
// Ejemplo corregido
export default async function CustomersPage({ searchParams }: any) {
  const _search = await searchParams;
  const q = _search?.q ?? '';
  // fetch de clientes con filtro q
}
        `}</Code>
        <p>
          Actualmente existen rutas base como:
        </p>
        <ul>
          <li><code>/</code> — Dashboard inicial con usuario autenticado.</li>
          <li><code>/login</code> — Formulario de acceso Supabase.</li>
          <li><code>/customers</code> — Módulo de clientes (tabla customer).</li>
          <li><code>/system/modulos/[id]</code> — Vista dinámica para módulos.</li>
        </ul>
      </Section>

      <Section title="4) Módulo de Clientes">
        <p>
          Se ha creado la tabla <b>customer</b> en Supabase y el listado inicial en <code>/customers</code>.
          El flujo CRUD está pensado para unificarse en una sola página (ver/editar/crear) usando parámetros de consulta.
        </p>
        <ul>
          <li>Consulta dinámica con <code>searchParams</code>.</li>
          <li>Lectura desde Supabase usando el cliente de servidor.</li>
          <li>Políticas de RLS aún por ajustar para lectura/escritura.</li>
        </ul>
      </Section>

      <Section title="5) Página de Módulos (System)">
        <p>
          Se ha implementado la vista dinámica <code>/system/modulos/[id]</code> con un componente unificado para ver, editar o crear módulos.
          Se corrigieron los errores relacionados con <code>params.id</code> y <code>searchParams</code> en entornos asincrónicos.
        </p>
        <ul>
          <li>El componente maneja modo vista y edición con <code>?edit=true</code>.</li>
          <li>El archivo de estilos asociado: <code>modulo-detalle.module.css</code>.</li>
        </ul>
      </Section>

      <Section title="6) Estado del proyecto y siguientes pasos">
        <ul>
          <li>✅ Supabase integrado y funcional con autenticación.</li>
          <li>✅ Estructura base de rutas y página de dashboard.</li>
          <li>✅ Página de clientes conectada a la base de datos.</li>
          <li>✅ Página de detalle de módulo funcional.</li>
          <li>🧩 Pendiente: middleware de sesión y control de acceso.</li>
          <li>🧩 Pendiente: interfaz para crear y editar clientes directamente.</li>
          <li>🧩 Pendiente: configuración visual del módulo de administración.</li>
        </ul>
      </Section>

      <hr style={{ margin: "32px 0" }} />
      <p>
        <b>Ubicación sugerida del archivo:</b> <code>apps/web/app/docs/page.tsx</code>
        <br />
        <Small>Documento de estado técnico — JiRo v2 (Supabase, Next.js, TypeScript).</Small>
      </p>
    </main>
  );
}