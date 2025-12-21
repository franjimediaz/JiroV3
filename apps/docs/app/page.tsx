export default function DocsEstadoActual() {
  const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <section style={{ marginBottom: 32 }}>
      <h2 style={{ fontSize: 22, marginBottom: 8 }}>{title}</h2>
      <div style={{ lineHeight: 1.6 }}>{children}</div>
    </section>
  );

  const Code: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <pre
      style={{
        background: "#0f172a",
        color: "#e5e7eb",
        padding: 16,
        borderRadius: 10,
        overflowX: "auto",
        fontSize: 13,
      }}
    >
      <code>{children}</code>
    </pre>
  );

  const Small = (p: any) => <small style={{ color: "#475569" }} {...p} />;

  return (
    <main style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
      <h1 style={{ fontSize: 32, marginBottom: 16 }}>JiRo v2 · Documentación de Estado Actual</h1>
      <p style={{ marginBottom: 24 }}>
        Este documento describe el estado actual del proyecto <b>JiRo v2</b>, centrado en la integración con{" "}
        <b>Supabase</b>, la arquitectura con Next.js (App Router) y las piezas reutilizables (sidebar, módulos y
        formulario dinámico).
        <br />
        <Small>Última revisión: 18 de noviembre de 2025</Small>
      </p>

      {/* 1) Stack */}
      <Section title="1) Stack actual">
        <ul>
          <li>
            <b>Framework:</b> Next.js 14 con App Router y TypeScript.
          </li>
          <li>
            <b>Base de datos y autenticación:</b> Supabase (PostgreSQL + Auth).
          </li>
          <li>
            <b>Gestión del proyecto:</b> Turborepo (estructura apps/web).
          </li>
          <li>
            <b>Estilos:</b> CSS global y módulos CSS básicos. Sin uso de Tailwind.
          </li>
        </ul>
      </Section>

      {/* 2) Auth */}
      <Section title="2) Autenticación con Supabase">
        <p>
          El sistema de login y logout ya está operativo. Se utiliza el cliente del servidor (<code>lib/supabase/server.ts</code>) para obtener el usuario en páginas <b>SSR</b>.
          Se ha corregido el uso de APIs obsoletas y el manejo de cookies en el lado del servidor.
        </p>
        <Code>{`// app/page.tsx (extracto funcional)
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
}`}</Code>
        <ul>
          <li>Se añadió cliente separado para navegador y servidor en <code>lib/supabase/</code>.</li>
          <li>Inicio de sesión validado y funcional.</li>
          <li>Pendiente: middleware SSR para proteger rutas según sesión.</li>
        </ul>
      </Section>

      {/* 3) Ruteo */}
      <Section title="3) Ruteo y estructura de páginas">
        <p>
          JiRo v2 utiliza el App Router de Next.js con rutas <b>dinámicas</b> y páginas unificadas para ver, editar y crear.
          Se ha corregido el error típico de Next 14: <code>params</code> y <code>searchParams</code> son promesas en componentes <i>async</i>.
        </p>
        <Code>{`// Ejemplo corregido
export default async function CustomersPage({ searchParams }: any) {
  const _search = await searchParams;
  const q = _search?.q ?? "";
  // fetch de clientes con filtro q
}`}</Code>
        <p>Actualmente existen rutas base como:</p>
        <ul>
          <li>
            <code>/</code> — Dashboard inicial con usuario autenticado.
          </li>
          <li>
            <code>/login</code> — Formulario de acceso Supabase.
          </li>
          <li>
            <code>/customers</code> — Módulo de clientes (tabla customer).
          </li>
          <li>
            <code>/system/modulos/[id]</code> — Vista dinámica para módulos.
          </li>
        </ul>
      </Section>

      {/* 4) Clientes */}
      <Section title="4) Módulo de Clientes">
        <p>
          Se ha creado la tabla <b>customer</b> en Supabase y el listado inicial en <code>/customers</code>. El flujo
          CRUD está pensado para unificarse en una sola página (ver/editar/crear) usando parámetros de consulta.
        </p>
        <ul>
          <li>Consulta dinámica con <code>searchParams</code>.</li>
          <li>Lectura desde Supabase usando el cliente de servidor.</li>
          <li>Políticas de RLS aún por ajustar para lectura/escritura.</li>
        </ul>
      </Section>

      {/* 5) Sistema de módulos */}
      <Section title="5) Sistema de Módulos (arquitectura)">
        <p>
          El sistema de módulos permite definir módulos (menús, tablas, vistas) y sus formularios desde datos (seed /
          admin) almacenados en la tabla <code>modulos</code>. Cada módulo tiene un payload <code>props</code> (JSON)
          que describe la tabla, los campos y la UI. Esto permite crear formularios dinámicos sin tocar código.
        </p>

        <h4>Forma del <code>props</code> (ModuleSchema)</h4>
        <p>
          Resumen de la interfaz clave (ver <code>packages/types/fields.ts</code> para la definición completa):
        </p>
        <Code>{`{
  db: { table: string, softDelete?: boolean, primaryKey?: string },
  fields: [
    {
      name: string;
      label: string;
      type: FieldType;
      required?: boolean;
      defaultValue?: any;
      ui?: {
        icon?: string;
        color?: string;
        width?: "1/1" | "1/2" | "1/3" | "2/3";
        help?: string;
        variant?: "textarea" | "default";
      };
      compute?: ...;
      allowOverride?: boolean;
      visible?: boolean;
      readOnly?: boolean;
    }
  ],
  ui?: {
    icon?: string;
    color?: string;
    formSections?: { id: string; label: string; description?: string; fields: string[] }[];
  }
}`}</Code>

        <h4>Semillas y edición</h4>
        <p>
          Las semillas están en <code>apps/web/lib/seed/modulos.seed.ts</code> (y/o <code>seed.modulos.json</code>). Puedes usar{" "}
          <code>SeedButton</code> para insertar/actualizar los registros en Supabase. Para que los iconos en el sidebar
          funcionen, guarda en <code>props.ui.icon</code> la clase de Bootstrap Icons (p. ej.{" "}
          <code>"bi-gear"</code>) o un emoji. El renderer del sidebar maneja ambas opciones.
        </p>
        <Code>{`// ejemplo en seed
{
  nombre: "Módulos",
  slug: "modulos",
  props: {
    ui: { icon: "bi-gear", color: "#0ea5e9" },
    db: { table: "modulos" },
    fields: [...]
  }
}`}</Code>
      </Section>

      {/* 6) Sidebar */}
      <Section title="6) Sidebar (navegación)">
        <p>
          El componente de navegación principal está en <code>packages/ui/src/Sidebar.tsx</code> y espera una lista de{" "}
          <code>SidebarItem</code> con la forma:
        </p>
        <Code>{`type SidebarItem = {
  id: string;
  nombre: string;
  route?: string;
  hijos?: SidebarItem[];
  icon?: string;
};`}</Code>

        <p>Notas importantes:</p>
        <ul>
          <li>
            El icono se renderiza así:
            <Code>{`<i className={"bi " + node.icon}></i>`}</Code>
            Por tanto, si usas Bootstrap Icons debes importar su CSS (p. ej. en{" "}
            <code>app/(main)/layout.tsx</code> importar{" "}
            <code>"bootstrap-icons/font/bootstrap-icons.css"</code>.
          </li>
          <li>
            Si el valor almacenado es un emoji (p. ej. <code>"⚙️"</code>), se puede renderizar directamente como texto (
            <code>{"<span>{node.icon}</span>"}</code>).
          </li>
          <li>
            El árbol se construye en servidor (ej. en <code>app/(main)/layout.tsx</code> con{" "}
            <code>buildTree(rows)</code>) y se pasa al Sidebar como prop.
          </li>
        </ul>

        <h4>Dónde modificar estilos</h4>
        <p>
          El Sidebar usa clases de Bootstrap y utilidades propias. Puntos comunes para cambiar:
        </p>
        <ul>
          <li>
            <code>.nav</code> / <code>.nav-link</code> — enlaces principales.
          </li>
          <li>
            <code>.btn</code> / utilidades de tamaño — botones dentro del sidebar.
          </li>
          <li>
            Clases de collapse/accordion: <code>data-bs-toggle="collapse"</code> y{" "}
            <code>.collapse</code>.
          </li>
        </ul>
      </Section>

      {/* 7) FORM: sección actualizada a tope */}
      <Section title="7) Formularios dinámicos (packages/ui/Form.tsx)">
        <p>
          El componente <code>Form</code> (default export en <code>packages/ui/src/Form.tsx</code>) es el{" "}
          <b>formulario dinámico central</b> de JiRo v2. Su objetivo es transformar un <code>ModuleSchema</code> en una UI
          editable, soportando modos de vista/edición, cálculo automático y overrides sin tener que escribir formularios
          específicos por tabla.
        </p>

        <h4>7.1. API del componente</h4>
        <Code>{`type Mode = "view" | "edit" | "create";

type FormProps = {
  schema: ModuleSchema;
  initialData?: any;
  onChange?: (values: any) => void;

  readOnly?: boolean;
  mode?: Mode;

  onSubmit?: (values: any) => void;
  onBack?: () => void;
  onEdit?: () => void;
};`}</Code>
        <ul>
          <li>
            <b>schema</b>: definición del módulo (campos, secciones, opciones de UI…).
          </li>
          <li>
            <b>initialData</b>: datos iniciales del registro (crear/editar/ver).
          </li>
          <li>
            <b>readOnly</b>: fuerza modo lectura; si no se pasa <code>mode</code>, deriva a <code>"view"</code>.
          </li>
          <li>
            <b>mode</b>: controla explícitamente el modo lógico (<code>"view"</code>, <code>"edit"</code> o{" "}
            <code>"create"</code>).
          </li>
          <li>
            <b>onSubmit(values)</b>: callback al pulsar “Guardar”, recibiendo los valores ya computados.
          </li>
          <li>
            <b>onBack()</b>: acción del botón “Volver”. Si no se define, hace <code>window.history.back()</code>.
          </li>
          <li>
            <b>onEdit()</b>: acción del botón “Editar”. Si no se define, añade <code>?edit=true</code> a la URL actual.
          </li>
          <li>
            <b>onChange(values)</b>: se dispara cuando cambia el estado interno del formulario (útil para previsualización en vivo).
          </li>
        </ul>

        <p>
          El modo efectivo se deriva así:
        </p>
        <Code>{`const effectiveMode: Mode =
  mode || (readOnly ? "view" : "edit");`}</Code>

        <h4>7.2. Estado interno y valores por defecto</h4>
        <p>
          El formulario mantiene un único estado <code>values</code>, que incluye tanto los campos “normales” como metadatos
          para overrides:
        </p>
        <Code>{`const [values, setValues] = useState<any>(() =>
  withDefaultValues(schema.fields, initialData)
);`}</Code>
        <p>La función <code>withDefaultValues</code> garantiza que cada campo tenga valor inicial:</p>
        <Code>{`function withDefaultValues(fields: Field[], base: any) {
  const out = { ...(base || {}) };
  for (const f of fields) {
    if (out[f.name] === undefined) {
      out[f.name] = f.defaultValue ?? defaultForType(f.type as FieldType);
    }
  }
  return out;
}

function defaultForType(t: FieldType): any {
  switch (t) {
    case "number":
    case "money":
    case "percent":
      return 0;
    case "boolean":
      return false;
    case "multiselect":
      return [];
    default:
      return "";
  }
}`}</Code>
        <p>
          Esto evita <code>undefined</code> en los inputs y mantiene coherencia de tipos antes de aplicar cálculos o
          envíos.
        </p>

        <h4>7.3. Sistema de cálculo automático (compute + dataProvider)</h4>
        <p>
          Cuando cambian los valores del formulario, se dispara un efecto que recalcula los campos con{" "}
          <code>compute</code>. Se usa un pequeño <i>debounce</i> para no saturar la capa de datos:
        </p>
        <Code>{`const [computing, setComputing] = useState(false);
const aggTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

useEffect(() => {
  if (!schema?.fields?.length) return;

  if (aggTimer.current) clearTimeout(aggTimer.current);
  setComputing(true);

  aggTimer.current = setTimeout(async () => {
    try {
      const computed = await applyCompute({
        schema,
        record: values,
        dataProvider,
      });
      setValues(computed);
      onChange?.(computed);
    } finally {
      setComputing(false);
    }
  }, 200);
}, [schema, JSON.stringify(lightDeps(values))]);`}</Code>
        <ul>
          <li>
            <b>applyCompute</b>: motor que evalúa fórmulas (<code>type: "formula"</code>) y agregados (
            <code>type: "aggregate"</code>).
          </li>
          <li>
            <b>dataProvider</b>: capa abstracta que el engine usa para hacer consultas a otras tablas (en entorno real
            se implementará contra Supabase/API).
          </li>
          <li>
            <b>lightDeps</b>: función que reduce el objeto de dependencias para no disparar el efecto por cambios
            irrelevantes en <code>meta</code>.
          </li>
        </ul>
        <p>
          Mientras un campo con <code>compute</code> se está recalculando y no tiene override activo, se muestra un texto
          auxiliar:
        </p>
        <Code>{`{computing && f.compute && !isOverride && (
  <div className="small text-muted mt-1">recalculando…</div>
)}`}</Code>

        <h4>7.4. Overrides de campos (allowOverride)</h4>
        <p>
          Si un campo tiene <code>allowOverride: true</code>, el formulario muestra un pequeño switch “Forzar valor”.
          Al activarlo, se guarda la información en <code>values.meta.overrides</code>:
        </p>
        <Code>{`const toggleOverride = (f: Field, enabled: boolean) => {
  setValues((prev: any) => ({
    ...prev,
    meta: {
      ...(prev.meta || {}),
      overrides: {
        ...(prev.meta?.overrides || {}),
        [f.name]: {
          enabled,
          value: enabled
            ? prev[f.name] ?? null
            : prev.meta?.overrides?.[f.name]?.value ?? null,
        },
      },
    },
  }));
};`}</Code>
        <p>Cuando un override está activo:</p>
        <ul>
          <li>El campo deja de ser solo lectura aunque tenga compute.</li>
          <li>El valor que manda es el del override, no el calculado.</li>
        </ul>
        <p>
          Para campos con override activo, el <code>onChange</code> actualiza tanto el valor visible como la estructura{" "}
          <code>meta.overrides</code>:
        </p>
        <Code>{`const setOverrideValue = (f: Field, value: any) => {
  setValues((prev: any) => ({
    ...prev,
    meta: {
      ...(prev.meta || {}),
      overrides: {
        ...(prev.meta?.overrides || {}),
        [f.name]: {
          enabled: true,
          value: normalizeValue(value),
        },
      },
    },
    [f.name]: normalizeValue(value),
  }));
};`}</Code>

        <h4>7.5. Layout por secciones (schema.ui.formSections)</h4>
        <p>
          El layout del formulario se basa en secciones configurables en <code>schema.ui.formSections</code>. Cada
          sección define un bloque tipo “card”:
        </p>
        <Code>{`const formSections =
  ((schema.ui as any)?.formSections as {
    id: string;
    label: string;
    description?: string;
    fields: string[];
  }[]) || [];`}</Code>
        <ul>
          <li>
            Si hay secciones definidas, se generan tarjetas (<code>.card</code>) para cada sección.
          </li>
          <li>
            Los campos se colocan en un grid usando clases Bootstrap (col-12, col-md-6, etc.) dependiendo de{" "}
            <code>field.ui.width</code>.
          </li>
          <li>
            Cualquier campo que no esté en ninguna sección aparece en una tarjeta “Otros campos”.
          </li>
        </ul>
        <Code>{`// Ejemplo de definición en props.ui.formSections
ui: {
  formSections: [
    {
      id: "datos-generales",
      label: "Datos generales",
      description: "Información básica del registro",
      fields: ["nombre", "descripcion", "estado"],
    },
    {
      id: "economia",
      label: "Datos económicos",
      fields: ["importe", "iva", "total"],
    },
  ];
}`}</Code>

        <h4>7.6. Render de campos por tipo (FieldInput)</h4>
        <p>
          La función interna <code>FieldInput</code> se encarga de dibujar el input adecuado según{" "}
          <code>field.type</code>:
        </p>
        <ul>
          <li>
            <b>boolean</b> → <code>&lt;input type="checkbox" /&gt;</code>
          </li>
          <li>
            <b>number / money / percent</b> → <code>&lt;input type="number" /&gt;</code>
          </li>
          <li>
            <b>date / datetime</b> → <code>&lt;input type="date" / "datetime-local" /&gt;</code>
          </li>
          <li>
            <b>color</b> → <code>&lt;input type="color" /&gt;</code>
          </li>
          <li>
            <b>select</b> → <code>&lt;select&gt;</code> con <code>field.options</code>.
          </li>
          <li>
            <b>multiselect</b> → lista de checkboxes.
          </li>
          <li>
            <b>file / image</b> → de momento, input de texto con URL (pendiente de enrutar a uploader real).
          </li>
          <li>
            <b>selectorTabla</b> → placeholder con input texto (pendiente de integrar el selector de tabla real).
          </li>
          <li>
            <b>text / textarea</b> → input o textarea según <code>field.ui.variant</code>.
          </li>
        </ul>
        <Code>{`if (type === "select") {
  const opts = field.options || [];
  return (
    <select
      className="form-select"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      disabled={readOnly}
    >
      <option value="">—</option>
      {opts.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}`}</Code>

        <h4>7.7. Acciones (Volver / Editar / Guardar) y modos</h4>
        <p>
          El formulario siempre renderiza un bloque de acciones común, adaptado al modo actual:
        </p>
        <ul>
          <li>
            <b>Siempre</b>: botón “Volver”.
          </li>
          <li>
            <b>Solo en view</b>: botón “Editar”.
          </li>
          <li>
            <b>Solo en edit/create</b>: botón “Guardar”.
          </li>
        </ul>
        <Code>{`const renderActions = () => (
  <>
    {/* Volver siempre visible */}
    <button
      type="button"
      className="btn btn-secondary px-4"
      onClick={handleBack}
    >
      ← Volver
    </button>

    {/* Editar SOLO en view */}
    {effectiveMode === "view" && (
      <button
        type="button"
        className="btn btn-warning px-4"
        onClick={handleEdit}
      >
        Editar
      </button>
    )}

    {/* Guardar SOLO en edit o create */}
    {(effectiveMode === "edit" || effectiveMode === "create") && (
      <button
        type="submit"
        className="btn btn-primary px-5"
        style={{
          background: "linear-gradient(90deg, #2563eb, #3b82f6)",
          border: "none",
          borderRadius: 10,
          boxShadow: "0 4px 12px rgba(37, 99, 235, 0.35)",
        }}
      >
        Guardar
      </button>
    )}
  </>
);`}</Code>
        <p>
          El envío de formulario está completamente delegado al padre vía <code>onSubmit(values)</code>:
        </p>
        <Code>{`const handleSubmit = (e: React.FormEvent) => {
  e.preventDefault();
  if (effectiveMode === "view") return;
  onSubmit?.(values);
};`}</Code>

        <h4>7.8. Uso típico desde una página</h4>
        <p>Ejemplo de integración en una página de detalle (por ejemplo, clientes o módulos):</p>
        <Code>{`// app/(main)/customers/[id]/page.tsx (ejemplo conceptual)
"use client";

import Form from "@repo/ui/Form";

export default function CustomerDetailPage({ params, searchParams }: any) {
  const mode: "view" | "edit" | "create" =
    searchParams?.edit === "true" ? "edit" : "view";

  // schema viene de la tabla modulos.props
  // initialData viene de Supabase
  return (
    <div className="container py-3">
      <h1>Cliente</h1>
      <Form
        schema={schema}
        initialData={customer}
        mode={mode}
        onSubmit={(values) => {
          // aquí llamas a una Server Action o a tu API
          // para hacer upsert/insert/update
        }}
        onBack={() => {
          // router.back() o navegación personalizada
        }}
        onEdit={() => {
          // router.push con ?edit=true o similar
        }}
      />
    </div>
  );
}`}</Code>

        <p>
          En resumen, el <code>Form</code> actual ya soporta:
        </p>
        <ul>
          <li>Modos <b>view/edit/create</b> con lógica interna coherente.</li>
          <li>Valores por defecto según tipo de campo y <code>defaultValue</code>.</li>
          <li>
            Cálculo automático de campos con <code>compute</code> y <code>dataProvider</code> (fórmulas y agregados).
          </li>
          <li>Overrides por campo para forzar valores calculados.</li>
          <li>Layout por secciones configurable desde <code>schema.ui.formSections</code>.</li>
          <li>Bloque de acciones estándar (Volver / Editar / Guardar) controlable vía callbacks.</li>
        </ul>
      </Section>

      {/* 8) Compute (vista global) */}
      <Section title="8) Tipos de campo y lógica de cálculo (Compute)">
        <p>
          Más allá de la implementación en <code>Form</code>, los campos pueden definir una propiedad{" "}
          <code>compute</code> que describe el cálculo automático. Existen dos variantes principales:
        </p>
        <ul>
          <li>
            <b>formula</b>: expresión sobre los campos del mismo registro.
          </li>
          <li>
            <b>aggregate</b>: cálculo que agrega datos desde otra tabla (p.ej. sumar costes).
          </li>
        </ul>
        <Code>{`// Ejemplo de compute tipo formula
compute: {
  type: "formula",
  expr: "cantidad * precioUnidad + totalMateriales",
  deps: ["cantidad", "precioUnidad", "totalMateriales"],
  persist: "none" | "onSave" | "always",
}

// Ejemplo de compute tipo aggregate
compute: {
  type: "aggregate",
  sourceTable: "materiales",
  field: "coste",
  op: "sum" | "avg" | "min" | "max" | "count",
  where: [
    { field: "obraId", op: "=", valueFrom: "this", path: "id" }
  ],
  persist: "onSave",
}`}</Code>
        <p>
          El motor de cálculo está en <code>packages/ui/src/engines/computeEngine.ts</code>. Para fórmulas se utiliza una
          evaluación controlada y para agregados se delega la consulta al <code>dataProvider</code>.
        </p>
      </Section>

      {/* 9) DataProvider */}
      <Section title="9) DataProvider y agregados">
        <p>
          <code>dataProvider</code> vive en <code>packages/ui/src/providers/DataProvider.ts</code> y es la capa que el
          motor de compute utiliza para:
        </p>
        <ul>
          <li>Obtener agregados (sum, count, etc.) desde otras tablas.</li>
          <li>Resolver referencias y selects para campos tipo <code>selectorTabla</code>.</li>
        </ul>
        <p>
          En entorno real deberá implementarse para hacer llamadas a Supabase / API REST y devolver resultados
          coherentes. Actualmente puede existir un stub de desarrollo que devuelve valores por defecto.
        </p>
      </Section>

      {/* 10) Server actions */}
      <Section title="10) Server actions e integración">
        <p>
          Para las acciones de formulario (crear/editar/eliminar) se utilizan Server Actions en{" "}
          <code>apps/web/app/(main)/customers/actions.ts</code> (o similares por módulo):
        </p>
        <ul>
          <li>
            <code>createCustomer(formData)</code>, <code>updateCustomer(id, formData)</code>,{" "}
            <code>deleteCustomer(id)</code>.
          </li>
          <li>
            Wrappers como <code>upsertCustomerAction</code> y <code>deleteCustomerAction</code> permiten usarlos como
            target directo de formularios.
          </li>
        </ul>
        <p>
          A futuro, la integración recomendada es enviar JSON mediante <code>fetch</code> a una Server Action que acepte{" "}
          <code>Request</code>/<code>FormData</code> o JSON directamente.
        </p>
      </Section>

      {/* 11) Errores comunes */}
      <Section title="11) Errores comunes y soluciones rápidas">
        <ul>
          <li>
            <b>Bootstrap Icons no se muestran:</b> instalar <code>bootstrap-icons</code> e importar{" "}
            <code>"bootstrap-icons/font/bootstrap-icons.css"</code> en el layout principal.
          </li>
          <li>
            <b>CSS Modules y estilos globales:</b> mover <code>:root</code> y reglas globales a{" "}
            <code>globals.css</code> o envolverlas con <code>:global(...)</code> en los módulos.
          </li>
          <li>
            <b>Typescript no resuelve @repo/types:</b> revisar los mappings de path en los{" "}
            <code>tsconfig.json</code> (por ejemplo, <code>"@repo/types": ["../../packages/types"]</code>).
          </li>
          <li>
            <b>Importaciones internas en packages/ui:</b> usar rutas relativas (p.ej.{" "}
            <code>"./engines/computeEngine"</code>) para evitar ciclos.
          </li>
        </ul>
      </Section>

      {/* 12) Siguientes pasos */}
      <Section title="12) Siguientes pasos recomendados">
        <ol>
          <li>
            Implementar un <b>dataProvider</b> real que consulte Supabase para aggregates y selects.
          </li>
          <li>
            Mejorar el flujo de envío de datos desde el <code>Form</code> usando JSON + Server Actions específicas.
          </li>
          <li>
            Añadir tests básicos para <code>computeEngine</code> (fórmulas y aggregates) y para el propio{" "}
            <code>Form</code>.
          </li>
          <li>Definir y aplicar políticas RLS para módulos y tablas sensibles.</li>
        </ol>
      </Section>

      {/* Página de módulos (detalle) */}
      <Section title="13) Página de Módulos (System)">
        <p>
          Se ha implementado la vista dinámica <code>/system/modulos/[id]</code> con un componente unificado para ver,
          editar o crear módulos. Se corrigieron los errores relacionados con <code>params.id</code> y{" "}
          <code>searchParams</code> en entornos asincrónicos.
        </p>
        <ul>
          <li>
            El componente maneja modo vista y edición mediante el parámetro <code>?edit=true</code>.
          </li>
          <li>
            El archivo de estilos asociado: <code>modulo-detalle.module.css</code>.
          </li>
          <li>
            El formulario interno de módulos (campos: nombre, slug, tipo, ruta, parent, props, etc.) se gestiona con{" "}
            <code>ModuloForm.tsx</code>, que valida el JSON de <code>props</code> en el cliente antes de enviar.
          </li>
        </ul>
      </Section>
            {/* 13.1) ModuloForm: tipos especiales de campo */}
<Section title="13.1) ModuloForm · Campos especiales (selectorTabla, formula y multiselect)">
  <p>
    <code>ModuloForm</code> es el editor visual del <code>ModuleSchema</code> (props JSON) que define:
    la tabla origen, los campos y la UI del formulario dinámico. En esta sección se documentan
    tres tipos de campo que requieren configuración extra: <b>selectorTabla</b>, <b>formula</b> y <b>multiselect</b>.
  </p>

  <h4>1) Campo tipo <code>selectorTabla</code></h4>
  <p>
    Un <code>selectorTabla</code> representa una referencia a otro módulo/tabla (por ejemplo, un campo clienteId
    que apunta a la tabla de clientes). Permite definir:
  </p>
  <ul>
    <li><b>moduleSlug</b>: a qué módulo/tabla apunta (por slug).</li>
    <li><b>displayField</b>: campo a mostrar en la UI (ej. nombre).</li>
    <li><b>valueField</b>: campo que se guarda (por defecto <code>"id"</code>).</li>
    <li><b>filters</b>: filtros opcionales (JSON) para limitar resultados.</li>
    <li><b>sort</b>: ordenación opcional (JSON).</li>
  </ul>

  <Code>{`// Ejemplo de campo selectorTabla
{
  name: "clienteId",
  label: "Cliente",
  type: "selectorTabla",
  ref: {
    moduleSlug: "clientes",
    displayField: "nombre",
    valueField: "id",
    filters: [
      { "field": "activo", "op": "=", "value": true }
    ],
    sort: [
      { "field": "nombre", "direction": "asc" }
    ]
  }
}`}</Code>

  <p>
    <b>Validación en ModuloForm:</b> si el tipo es <code>selectorTabla</code>, el editor exige que
    <code>ref.moduleSlug</code> y <code>ref.displayField</code> sean strings válidos, para evitar props corruptos.
  </p>
  <p>
    <b>Nota:</b> en el <code>Form</code> dinámico actual, el renderer del <code>selectorTabla</code> es un placeholder
    (input de texto). El comportamiento final (desplegable con búsqueda, carga remota, etc.) depende de implementar
    un <code>dataProvider</code> real.
  </p>

  <hr style={{ margin: "18px 0" }} />

  <h4>2) Campo con cálculo tipo <code>formula</code> (compute)</h4>
  <p>
    En JiRo v2, el tipo “formula” no es un tipo de input, sino un modo de cálculo en la propiedad
    <code>compute</code>. Se configura desde ModuloForm seleccionando <code>compute = formula</code>.
  </p>

  <p>Una fórmula requiere:</p>
  <ul>
    <li><b>expr</b>: expresión a evaluar.</li>
    <li><b>deps</b>: lista de dependencias (campos que disparan el recálculo).</li>
    <li><b>persist</b>: cuándo se persiste el resultado (<code>none</code>, <code>onSave</code>, <code>always</code>).</li>
  </ul>

  <Code>{`// Ejemplo compute formula
{
  name: "total",
  label: "Total",
  type: "money",
  readOnly: true,
  allowOverride: true,
  compute: {
    type: "formula",
    expr: "cantidad * precioUnidad",
    deps: ["cantidad", "precioUnidad"],
    persist: "onSave"
  }
}`}</Code>

  <p>
    <b>Validación en ModuloForm:</b> cuando <code>compute.type === "formula"</code>, se valida que:
    <code>expr</code> sea string y <code>deps</code> sea un array.
  </p>

  <p>
    <b>Comportamiento en Form:</b> el valor se recalcula automáticamente. Si el campo tiene
    <code>allowOverride: true</code>, el usuario puede marcar “Forzar valor” y escribir manualmente,
    incluso si el campo es calculado.
  </p>

  <hr style={{ margin: "18px 0" }} />

  <h4>3) Campo tipo <code>multiselect</code></h4>
  <p>
    Un <code>multiselect</code> es un campo cuyo valor es un <b>array de strings</b>. En ModuloForm,
    este tipo requiere definir <code>options</code> (lista de valores permitidos).
  </p>

  <Code>{`// Ejemplo multiselect
{
  name: "servicios",
  label: "Servicios",
  type: "multiselect",
  options: ["Albañilería", "Fontanería", "Electricidad"],
  defaultValue: []
}`}</Code>

  <p>
    <b>Validación en ModuloForm:</b> si el tipo es <code>multiselect</code>, se espera que
    <code>options</code> exista y sea array. El editor incluye un input tipo “chips” para añadir opciones.
  </p>

  <p>
    <b>Comportamiento en Form:</b> se renderiza como lista de checkboxes. Al seleccionar o deseleccionar,
    el valor se guarda como array.
  </p>
</Section>
{/* 13.2) ModuloForm · Validaciones y responsabilidades */}
<Section title="13.2) ModuloForm · Validaciones y responsabilidades">
  <p>
    <code>ModuloForm</code> no es solo un editor visual: actúa como <b>primera línea de validación</b>
    del <code>ModuleSchema</code> antes de que el formulario dinámico lo consuma en runtime.
  </p>

  <h4>Responsabilidades de ModuloForm</h4>
  <ul>
    <li>Garantizar que la estructura del <code>props</code> sea coherente.</li>
    <li>Prevenir configuraciones inválidas desde la UI.</li>
    <li>Reducir errores en tiempo de ejecución del <code>Form</code>.</li>
  </ul>

  <h4>Validaciones clave</h4>
  <ul>
    <li>
      <b>Campos básicos:</b> <code>name</code>, <code>label</code> y <code>type</code> son obligatorios.
    </li>
    <li>
      <b>selectorTabla:</b> se valida la existencia de <code>ref.moduleSlug</code> y
      <code>ref.displayField</code>.
    </li>
    <li>
      <b>compute.formula:</b> se valida que <code>expr</code> sea string y <code>deps</code> un array.
    </li>
    <li>
      <b>compute.aggregate:</b> se valida <code>sourceTable</code>, <code>field</code> y <code>op</code>.
    </li>
    <li>
      <b>multiselect:</b> se valida que <code>options</code> sea un array de strings.
    </li>
  </ul>

  <h4>Límite de responsabilidad</h4>
  <p>
    ModuloForm <b>no ejecuta lógica de negocio</b> ni consultas reales. Su función termina al generar
    un <code>ModuleSchema</code> válido. El comportamiento final depende de:
  </p>
  <ul>
    <li>El componente <code>Form</code> (renderizado y UX).</li>
    <li>El <code>computeEngine</code> (cálculo).</li>
    <li>El <code>dataProvider</code> (acceso a datos externos).</li>
  </ul>

  <p>
    Esta separación permite evolucionar cada capa de forma independiente sin romper el sistema.
  </p>
</Section>


      {/* 15) Sistema de permisos y control de acceso */}
        <Section title="15) Sistema de permisos y control de acceso (frontend)">
          <p>
            JiRo v2 implementa un sistema de control de acceso centralizado en frontend,
            basado en <b>roles</b> y <b>permisos por módulo y acción</b>. El objetivo es:
          </p>
          <ul>
            <li>Evitar lógica de permisos dispersa por la UI.</li>
            <li>Unificar nombres de módulos y acciones.</li>
            <li>Proteger rutas, vistas y acciones de forma declarativa.</li>
          </ul>

          <h4>15.1. Modelo de permiso</h4>
          <p>Un permiso se define por:</p>
          <Code>{`type Accion = "ver" | "crear" | "actualizar" | "eliminar" | "*";

        type Permiso = {
          modulo: string;
          accion: Accion;
        };`}</Code>

          <p>
            Los permisos se obtienen del backend (Supabase) y se normalizan en el
            <code>PermisosProvider</code>.
          </p>

          <h4>15.2. PermisosProvider</h4>
          <p>
            El provider vive en <code>app/lib/permisos.tsx</code> y expone:
          </p>
          <Code>{`{
          permisos: Permiso[];
          hasPermiso(modulo: string, accion?: Accion): boolean;
          loading: boolean;
        }`}</Code>

          <p>
            El provider se monta en el layout principal (<code>ClientLayout</code>) y:
          </p>
          <ul>
            <li>Normaliza nombres de módulos (aliases).</li>
            <li>Normaliza acciones (read/view → ver, edit/update → actualizar).</li>
            <li>Soporta comodín <code>*</code> para acciones o módulos completos.</li>
          </ul>

          <h4>15.3. Protección de vistas con RequirePermiso</h4>
          <p>
            Para proteger una página o componente se usa el wrapper:
          </p>
          <Code>{`<RequirePermiso modulo="clientes" accion="ver">
          <ClientesPage />
        </RequirePermiso>`}</Code>

          <p>Comportamiento:</p>
          <ul>
            <li>Si no hay sesión → redirige a <code>/login</code>.</li>
            <li>Si hay sesión pero no permiso → redirige a <code>/403</code>.</li>
            <li>Las rutas públicas quedan excluidas automáticamente.</li>
          </ul>
        </Section>
            {/* 16) Roles y permisos por módulo */}
              <Section title="16) Roles y permisos por módulo">
                <p>
                  Los <b>roles</b> definen un conjunto de permisos estructurados por módulo.
                  Cada rol almacena un JSON donde se indica qué acciones están permitidas
                  en cada módulo.
                </p>

                <h4>Estructura típica de permisos en un rol</h4>
                <Code>{`{
                "clientes": {
                  "ver": true,
                  "crear": true,
                  "actualizar": true,
                  "eliminar": false
                },
                "obras": {
                  "ver": true,
                  "crear": false,
                  "actualizar": false,
                  "eliminar": false
                },
                "system": {
                  "*": false
                }
              }`}</Code>

                <p>
                  Este enfoque permite:
                </p>
                <ul>
                  <li>Gestionar accesos sin tocar código.</li>
                  <li>Escalar módulos sin redefinir lógica de permisos.</li>
                  <li>Usar el mismo esquema para frontend y backend (RLS).</li>
                </ul>

                <p>
                  La vista <code>/system/roles</code> permite editar estos permisos de forma
                  visual, generando automáticamente el JSON.
                </p>
              </Section>
{/* 17) ActionMenu y patrón de acciones */}
<Section title="17) ActionMenu y patrón de acciones condicionadas">
  <p>
    JiRo v2 utiliza un componente reutilizable <code>ActionMenu</code> para
    centralizar las acciones de cada fila en vistas de listado
    (clientes, obras, roles, etc.).
  </p>

  <h4>Características</h4>
  <ul>
    <li>Acciones definidas por configuración.</li>
    <li>Soporte de visibilidad condicional.</li>
    <li>Integración directa con el sistema de permisos.</li>
  </ul>

  <Code>{`const actions = [
  {
    label: "Ver",
    onClick: () => onView(row),
    permiso: { modulo: "clientes", accion: "ver" },
  },
  {
    label: "Editar",
    onClick: () => onEdit(row),
    permiso: { modulo: "clientes", accion: "actualizar" },
  },
  {
    label: "Eliminar",
    onClick: () => onDelete(row),
    permiso: { modulo: "clientes", accion: "eliminar" },
  },
];`}</Code>

  <p>
    El menú solo renderiza las acciones permitidas según el contexto del usuario,
    evitando mostrar botones que luego fallarían.
  </p>
</Section>
{/* 18) Decisiones arquitectónicas clave */}
<Section title="18) Decisiones arquitectónicas clave">
  <ul>
    <li>
      <b>Formularios dinámicos</b> en lugar de formularios hardcodeados:
      permite escalar módulos sin duplicar lógica.
    </li>
    <li>
      <b>Permisos en frontend declarativos</b>:
      evita condicionales dispersos y facilita auditoría.
    </li>
    <li>
      <b>ActionMenu desacoplado</b>:
      misma UX en todas las tablas, menos código repetido.
    </li>
    <li>
      <b>JSON como fuente de verdad</b> para módulos y permisos:
      permite edición visual y futura automatización.
    </li>
    <li>
      <b>No uso de Tailwind</b>:
      se prioriza claridad, CSS explícito y menor fricción mental.
    </li>
  </ul>
</Section>


      {/* Estado global */}
<Section title="XXX) Estado del proyecto y siguientes pasos globales">
  <ul>
    <li>✅ Supabase integrado y funcional (PostgreSQL + Auth).</li>
    <li>✅ Arquitectura base consolidada con Next.js App Router y TypeScript.</li>
    <li>✅ Sistema de módulos dinámicos operativo (definición por JSON en base de datos).</li>
    <li>✅ Página de módulos (/system/modulos/[id]) completamente funcional y editable desde UI.</li>
    <li>
      ✅ Componente Form dinámico centralizado con soporte de:
      <ul>
        <li>modos view / edit / create,</li>
        <li>cálculo automático (formula y aggregate),</li>
        <li>overrides por campo,</li>
        <li>layout por secciones configurables.</li>
      </ul>
    </li>
    <li>✅ Sistema de permisos en frontend implementado (PermisosProvider + RequirePermiso).</li>
    <li>✅ ActionMenu reutilizable con acciones condicionadas por permisos.</li>

    <li>🧩 Pendiente: implementación de un dataProvider real conectado a Supabase (aggregates y selectorTabla).</li>
    <li>🧩 Pendiente: alineación completa entre permisos frontend y políticas RLS en Supabase.</li>
    <li>🧩 Pendiente: mejora de la UX del builder de módulos y campos (validaciones, ayudas, prevención de errores).</li>
    <li>🧩 Pendiente: tests básicos de computeEngine, permisos críticos y flujos principales.</li>
    <li>🧩 Pendiente: documentación funcional orientada a system admins (uso del builder y permisos).</li>
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
