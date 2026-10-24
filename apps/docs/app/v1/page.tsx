/* Static documentation intentionally contains quoted code and prose. */
/* eslint-disable react/no-unescaped-entities, react/prop-types */

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

  const Small = (p: React.ComponentProps<"small">) => <small style={{ color: "#475569" }} {...p} />;

  return (
    <main style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
      <h1 style={{ fontSize: 32, marginBottom: 16 }}>JiRo v2 · Documentación de Estado Actual</h1>
      <p style={{ marginBottom: 24 }}>
        Este documento describe el estado actual del proyecto <b>JiRo v2</b>, centrado en la integración con <b>Supabase</b>, la arquitectura con Next.js (App Router) y las piezas reutilizables (sidebar, módulos y formulario dinámico).
        <br />
        <Small>Última revisión: 10 de noviembre de 2025</Small>
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

      <Section title="5) Sistema de Módulos (arquitectura)">
        <p>
          El sistema de módulos permite definir módulos (menús, tablas, vistas) y sus formularios desde datos (seed / admin) almacenados en la tabla <code>modulos</code>.
          Cada módulo tiene un payload <code>props</code> (JSON) que describe la tabla, los campos y la UI. Esto permite crear formularios dinámicos sin tocar código.
        </p>

        <h4>Forma del <code>props</code> (ModuleSchema)</h4>
        <p>Resumen de la interfaz clave (ver <code>packages/types/fields.ts</code> para la definición completa):</p>
        <Code>{`{
  db: { table: string, softDelete?: boolean, primaryKey?: string },
  fields: [
    { name: string, label: string, type: FieldType, required?: boolean, defaultValue?: any, ui?: { icon?: string, color?: string, width?: '1/1'|'1/2'|'1/3' } }
  ],
  ui?: { icon?: string, color?: string }
}`}</Code>

        <h4>Semillas y edición</h4>
        <p>Las semillas están en <code>apps/web/lib/seed/modulos.seed.ts</code> (y <code>seed.modulos.json</code>). Puedes usar <code>SeedButton</code> para insertar/actualizar los registros en Supabase.
        Para que los iconos en el sidebar funcionen, guarda en <code>props.ui.icon</code> la clase de Bootstrap Icons (p. ej. <code>"bi-gear"</code>) o un emoji. El renderer del sidebar maneja ambas opciones.</p>
        <Code>{`// ejemplo en seed
{
  nombre: "Módulos",
  slug: "modulos",
  props: { ui: { icon: "bi-gear", color: "#0ea5e9" }, db: { table: "modulos" }, fields: [...] }
}`}</Code>
      </Section>

      <Section title="6) Sidebar (navegación)">
        <p>
          El componente de navegación principal está en <code>packages/ui/src/Sidebar.tsx</code> y espera una lista de <code>SidebarItem</code> con la forma:
        </p>
        <Code>{`type SidebarItem = { id: string; nombre: string; route?: string; hijos?: SidebarItem[]; icon?: string }`}</Code>

        <p>Notas importantes:</p>
        <ul>
          <li>
            El icono se renderiza así:
            <Code>{`<i className={"bi " + node.icon}></i>`}</Code>
            Por tanto, si usas Bootstrap Icons debes importar su CSS (p. ej. en <code>app/(main)/layout.tsx</code> importar <code>"bootstrap-icons/font/bootstrap-icons.css"</code>).
          </li>
          <li>
            Si el valor almacenado es un emoji (p. ej. "⚙️"), renderízalo como texto:
            <Code>{`<span>{node.icon}</span>`}</Code>
          </li>
          <li>El árbol se construye en servidor (ej. en <code>app/(main)/layout.tsx</code> con <code>buildTree(rows)</code>) y se pasa al Sidebar como prop.</li>
        </ul>

        <h4>Dónde modificar estilos</h4>
        <p>El Sidebar usa clases de Bootstrap y utilidades propias. Puntos comunes para cambiar:</p>
        <ul>
          <li><code>.nav</code> / <code>.nav-link</code> — enlaces principales.</li>
          <li><code>.btn</code> / utilidades de tamaño — botones dentro del sidebar.</li>
          <li>Clases de collapse/accordion: <code>data-bs-toggle="collapse"</code> y <code>.collapse</code>.</li>
        </ul>
      </Section>

      <Section title="7) Formularios dinámicos (packages/ui/Form.tsx)">
        <p>
          El componente <code>Form</code> (exportado como default desde <code>packages/ui/src/Form.tsx</code>) es un componente cliente que transforma un <code>ModuleSchema</code> en una interfaz editable.
        </p>

        <h4>Principales características</h4>
        <ul>
          <li>Inicializa campos con <code>withDefaultValues</code> (usa <code>defaultValue</code> o valores por tipo).</li>
          <li>Renderiza inputs por tipo en <code>FieldInput</code> (text, number, date, color, select, multiselect, file, image, selectorTabla).</li>
          <li>Soporta <b>overrides</b>: permite forzar un valor calculado para un registro concreto.</li>
          <li>Integra cálculo de campos con <code>applyCompute</code> (fórmulas y agregados).</li>
        </ul>

        <h4>Uso desde las páginas</h4>
        <p>
          En <code>/customers/[id]</code> se usa un componente cliente <code>CustomerFormClient</code> que renderiza <code>Form</code> y envía los datos a Server Actions (<code>upsertCustomerAction</code>, <code>deleteCustomerAction</code>).
          Esa integración se hace actualmente usando inputs ocultos para enviar FormData al servidor; es una aproximación simple pero válida. Alternativa recomendada: enviar JSON por fetch a una Server Action que acepte JSON.
        </p>
      </Section>

      <Section title="8) Tipos de campo y lógica de cálculo (Compute)">
        <p>
          Los campos pueden tener una propiedad <code>compute</code> que describe cálculo automático. Existen dos variantes:
        </p>
        <ul>
          <li><b>formula</b>: expresión sobre los campos del mismo registro. Forma:
            <Code>{`{ type: 'formula', expr: 'cantidad * precioUnidad + totalMateriales', deps: ['cantidad','precioUnidad','totalMateriales'], persist: 'none' | 'onSave' | 'always' }`}</Code>
          </li>
          <li><b>aggregate</b>: cálculo que agrega datos desde otra tabla (p.ej. sumar costes de materiales asociados). Forma:
            <Code>{`{ type: 'aggregate', sourceTable: 'materiales', field: 'coste', op: 'sum' | 'avg' | 'min' | 'max' | 'count', where: [ { field: 'obraId', op: '=', valueFrom: 'this', path: 'id' } ], persist: 'onSave' }`}</Code>
          </li>
        </ul>

        <p>
          El motor de cálculo está en <code>packages/ui/src/engines/computeEngine.ts</code>. Para fórmulas usamos <code>safeEval</code> (una evaluación controlada) y para agregados se delega al <code>dataProvider</code> que puede implementarse para hacer consultas a Supabase.
        </p>
      </Section>

      <Section title="9) DataProvider y agregados">
        <p>
          <code>dataProvider</code> está en <code>packages/ui/src/providers/DataProvider.ts</code>. Es una capa abstracta que el motor de fórmulas usa para:
        </p>
        <ul>
          <li>Obtener agregados (summaries) desde otras tablas.</li>
          <li>Resolver selects/refs para campos <code>selectorTabla</code>.</li>
        </ul>

        <p>En entorno real debes implementar <code>dataProvider</code> para llamar a tu API/DB y devolver los resultados (en desarrollo se incluye un stub que devuelve valores por defecto).</p>
      </Section>

      <Section title="10) Server actions e integración">
        <p>
          Para las acciones de formulario (crear/editar/eliminar) se usan Server Actions en <code>apps/web/app/(main)/customers/actions.ts</code>:
        </p>
        <ul>
          <li><code>createCustomer(formData)</code>, <code>updateCustomer(id, formData)</code>, <code>deleteCustomer(id)</code>.</li>
          <li>Se añadieron wrappers <code>upsertCustomerAction</code> y <code>deleteCustomerAction</code> para usar directamente como target de <code>&lt;form action=...&gt;</code> desde un componente cliente.</li>
        </ul>
      </Section>

      <Section title="11) Errores comunes y soluciones rápidas">
        <ul>
          <li><b>Bootstrap Icons no se muestran:</b> instala <code>bootstrap-icons</code> y importa <code>"bootstrap-icons/font/bootstrap-icons.css"</code> en tu layout (ej.: <code>app/(main)/layout.tsx</code>).</li>
          <li><b>CSS Modules - Selector global:</b> mover <code>:root</code> y usar reglas globales en <code>globals.css</code> o envolverlas con <code>:global(...)</code> en módulos. Por ejemplo:
            <Code>{`:root { --bg: #0b0d10; }
* { box-sizing: border-box; }`}</Code>
          </li>
          <li><b>Typescript no resuelve @repo/types:</b> asegura mappings en los <code>tsconfig.json</code> (ej. <code>"@repo/types": ["../../packages/types"]</code> en <code>apps/web/tsconfig.json</code>).</li>
          <li><b>Importaciones internas en packages/ui:</b> usa rutas relativas dentro del paquete para evitar ciclos (p. ej. <code>./engines/computeEngine</code>).</li>
        </ul>
      </Section>

      <Section title="12) Siguientes pasos recomendados">
        <ol>
          <li>Implementar un <b>dataProvider</b> real que consulte Supabase para aggregates y selects.</li>
          <li>Mejorar la forma de enviar datos desde el formulario (usar JSON + Server Action aceptando JSON en vez de hidden inputs).</li>
          <li>Agregar tests básicos para <code>computeEngine</code> (fórmulas y aggregates) y para <code>Form</code>.</li>
          <li>Definir y aplicar políticas RLS para módulos sensibles.</li>
        </ol>
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
