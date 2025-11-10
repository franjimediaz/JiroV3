export type SeedNode = {
  nombre: string;
  slug: string;
  route?: string;
  tipo: "carpeta" | "tabla" | "subtabla" | "vista";
  orden?: number;
  activo?: boolean;
  props?: any;
  children?: SeedNode[];
};

export const MODULOS_SEED: SeedNode[] = [
  {
    nombre: "Configuración",
    slug: "system",
    tipo: "carpeta",
    orden: 1,
    props: {
       ui: { icon: "bi bi-gear", color: "#0ea5e9", view: "tree", defaultSort: { field: "orden", dir: "asc" } }
    },
    children: [
      {
        nombre: "Módulos",
        slug: "modulos",
        route: "/system/modulos",
        tipo: "tabla",
        orden: 1,
        props: {
          db: { table: "modulos", primaryKey: "id", softDelete: false },
          fields: [
            { name: "nombre", label: "Nombre", type: "text", required: true, list: true, filter: true },
            { name: "slug", label: "Slug", type: "text", required: true, list: true, filter: true }
          ],
          ui: { icon: "bi bi-gear", color: "#0ea5e9", view: "tree", defaultSort: { field: "orden", dir: "asc" } },
          permissions: { systemadmin: { read: true, create: true, update: true, delete: true } }
        }
      },
            {
        nombre: "Usuarios",
        slug: "usuarios",
        route: "/system/usuarios",
        tipo: "tabla",
        orden: 1,
        props: {
          db: { table: "usuarios", primaryKey: "id", softDelete: false },
          fields: [
            { name: "nombre", label: "Nombre", type: "text", required: true, list: true, filter: true },
            { name: "slug", label: "Slug", type: "text", required: true, list: true, filter: true }
          ],
          ui: { icon: "bi bi-gear", color: "#0ea5e9", view: "tree", defaultSort: { field: "orden", dir: "asc" } },
          permissions: { systemadmin: { read: true, create: true, update: true, delete: true } }
        },
        children: [
          {
        nombre: "Directorio",
        slug: "directorio",
        route: "/system/directorio",
        tipo: "subtabla",
        orden: 1,
        props: {
          db: { table: "directorio", primaryKey: "id", softDelete: false },
          fields: [
            { name: "nombre", label: "Nombre", type: "text", required: true, list: true, filter: true },
            { name: "slug", label: "Slug", type: "text", required: true, list: true, filter: true }
          ],
          ui: { icon: "bi bi-gear", color: "#0ea5e9", view: "tree", defaultSort: { field: "orden", dir: "asc" } },
          permissions: { systemadmin: { read: true, create: true, update: true, delete: true } }
        }
      },
        ]
      },
      {
        nombre: "Roles",
        slug: "Rol",
        route: "/system/rol",
        tipo: "tabla",
        orden: 1,
        props: {
          db: { table: "roles", primaryKey: "id", softDelete: false },
          fields: [
            { name: "nombre", label: "Nombre", type: "text", required: true, list: true, filter: true },
            { name: "slug", label: "Slug", type: "text", required: true, list: true, filter: true }
          ],
          ui: { icon: "bi bi-gear", color: "#0ea5e9", view: "tree", defaultSort: { field: "orden", dir: "asc" } },
          permissions: { systemadmin: { read: true, create: true, update: true, delete: true } }
        }
      },
      {
        nombre: "Estados",
        slug: "estados_obra_config",
        route:"/system/estados_obra_config",
        tipo: "tabla",
        orden: 2,
        props: {
          db: { table: "estados_obra_config", softDelete: false },
          fields: [
            { name: "nombre", label: "Nombre", type: "text", required: true, list: true, filter: true },
            { name: "color", label: "Color", type: "color", list: true },
            { name: "icono", label: "Icono", type: "text", list: true },
            { name: "orden", label: "Orden", type: "number", list: true }
          ],
          ui: { icon: "bi-tag", color: "#6b7280", view: "list" }
        }
      },
      {
        nombre: "Servicios",
        slug: "servicios_config",
        route:"/system/servicios_config",
        tipo: "tabla",
        orden: 3,
        props: {
          db: { table: "servicios_config", softDelete: false },
          fields: [
            { name: "nombre", label: "Nombre", type: "text", required: true, list: true, filter: true },
            { name: "color", label: "Color", type: "color", list: true },
            { name: "icono", label: "Icono", type: "text", list: true }
          ],
          ui: { icon: "bi-puzzle", color: "#10b981", view: "list" }
        }
      }
    ]
  },
  {
    nombre: "Clientes / Pacientes",
    slug: "clientes",
    route:"/customers",
    tipo: "tabla",
    orden: 2,
    props: {
      db: { table: "clientes", softDelete: true },
      fields: [
        { name: "nombre", label: "Nombre", type: "text", required: true, list: true, filter: true },
        { name: "email", label: "Email", type: "text", list: true, filter: true }
      ],
      ui: { icon: "bi-person", color: "#3b82f6", view: "list" }
    }
  },
  {
    nombre: "Proyectos",
    slug: "proyectos",
    route:"/py",
    tipo: "tabla",
    orden: 3,
    props: {
      db: { table: "proyectos", softDelete: true },
      fields: [
        { name: "nombre", label: "Nombre", type: "text", required: true, list: true, filter: true },
        {
          name: "clienteId", label: "Cliente", type: "selectorTabla",
          ref: { moduleSlug: "clientes", displayField: "nombre" },
          required: true, list: true, filter: true
        },
        {
          name: "estadoId", label: "Estado", type: "selectorTabla",
          ref: { moduleSlug: "estados_obra_config", displayField: "nombre" },
          list: true, filter: true
        }
      ],
      ui: { icon: "bi-file", color: "#2563eb", view: "list" }
    },
    children: [
      {
        nombre: "Tareas",
        slug: "tareas",
        route:"/tareas",
        tipo: "tabla",
        orden: 1,
        props: {
          db: { table: "tareas", softDelete: true },
          fields: [
            { name: "nombre", label: "Nombre", type: "text", required: true, list: true, filter: true },
            {
              name: "obraId", label: "Obra", type: "selectorTabla",
              ref: { moduleSlug: "obras", displayField: "nombre" },
              required: true, list: true, filter: true
            }
          ],
          ui: { icon: "bi-file", color: "#8b5cf6", view: "list" }
        }
      },
      {
        nombre: "Presupuestos",
        slug: "presupuestos",
        route:"/obras/presupuestos",
        tipo: "tabla",
        orden: 2,
        props: {
          db: { table: "presupuestos", softDelete: false },
          fields: [
            { name: "descripcion", label: "Descripción", type: "textarea", list: true },
            {
              name: "obraId", label: "Obra", type: "selectorTabla",
              ref: { moduleSlug: "obras", displayField: "nombre" },
              required: true, list: true
            }
          ],
          ui: { icon: "bi-file", color: "#0ea5e9", view: "list" }
        },
        children: [
          {
            nombre: "Presupuesto Servicios",
            slug: "presupuesto_servicios",
            tipo: "subtabla",
            orden: 1,
            props: {
              db: { table: "presupuesto_servicios" },
              fields: [
                { name: "nombre", label: "Nombre", type: "text", required: true, list: true },
                {
                  name: "presupuestoId", label: "Presupuesto", type: "selectorTabla",
                  ref: { moduleSlug: "presupuestos", displayField: "descripcion" }, required: true
                }
              ],
              ui: { icon: "bi-file", color: "#10b981", view: "list" }
            },
            children: [
              {
                nombre: "Presupuesto Tareas",
                slug: "presupuesto_tareas",
                tipo: "subtabla",
                orden: 1,
                props: {
                  db: { table: "presupuesto_tareas" },
                  fields: [
                    { name: "nombre", label: "Nombre", type: "text", required: true, list: true },
                    {
                      name: "presupuestoServicioId", label: "Capítulo", type: "selectorTabla",
                      ref: { moduleSlug: "presupuesto_servicios", displayField: "nombre" }, required: true
                    }
                  ],
                  ui: { icon: "bi-file", color: "#f59e0b", view: "list" }
                }
              }
            ]
          }
        ]
      },
      {
        nombre: "Materiales",
        slug: "materiales",
        route:"/obras/materiales",
        tipo: "tabla",
        orden: 3,
        props: {
          db: { table: "materiales", softDelete: false },
          fields: [
            { name: "nombre", label: "Nombre", type: "text", required: true, list: true, filter: true },
            { name: "precioUnidad", label: "€/ud", type: "money", list: true }
          ],
          ui: { icon: "bi-file", color: "#ef4444", view: "list" }
        }
      }
    ]
  }
];
