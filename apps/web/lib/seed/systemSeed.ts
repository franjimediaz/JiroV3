import { SeedNode } from "@repo/types";

export const systemSeed: SeedNode[] = [
{
  "slug": "system",
  "nombre": "Configuración",
  "orden": 1,
  "tipo": "carpeta",
  "activo": true,
  "props": {
    "db": {
      "softDelete": false
    },
    "ui": {
      "icon": "bi bi-gear",
      "color": "#0ea5e9",
      "view": "tree"
    }
  },
  "children": [
    {
      "slug": "modulos",
      "nombre": "Módulos",
      "orden": 1,
      "tipo": "tabla",
      "activo": true,
      "props": {
        "db": {
          "table": "modulos",
          "softDelete": false
        },
        "ui": {
          "icon": "bi-star",
          "color": "#0ea5e9",
          "view": "tree"
        },
        "fields": [
          {
            "name": "nombre",
            "type": "text",
            "label": "Nombre",
            "required": true,
            "list": true,
            "filter": true,
            "readOnly": false
          },
          {
            "name": "campo_3",
            "type": "text",
            "label": "Nuevo campo",
            "required": false,
            "list": false,
            "filter": false,
            "readOnly": false
          },
          {
            "name": "slug",
            "type": "text",
            "label": "Slug",
            "required": true,
            "list": true,
            "filter": true,
            "readOnly": false
          }
        ]
      }
    },
    {
      "slug": "rol",
      "nombre": "Roles",
      "orden": 1,
      "tipo": "tabla",
      "activo": true,
      "props": {
        "db": {
          "table": "roles",
          "softDelete": false
        },
        "ui": {
          "icon": "bi-toggles",
          "color": "#0ea5e9",
          "view": "tree"
        },
        "fields": [
          {
            "name": "title",
            "type": "text",
            "label": "Nombre",
            "required": true,
            "list": true,
            "filter": true,
            "readOnly": false
          },
          {
            "name": "slug",
            "type": "text",
            "label": "Slug",
            "required": true,
            "list": true,
            "filter": true,
            "readOnly": false
          },
          {
            "name": "description",
            "type": "text",
            "label": "Descripción",
            "required": false,
            "list": false,
            "filter": false,
            "readOnly": false
          }
        ]
      }
    },
    {
      "slug": "usuarios",
      "nombre": "Usuarios",
      "orden": 1,
      "tipo": "tabla",
      "activo": true,
      "props": {
        "db": {
          "table": "usuarios",
          "softDelete": false
        },
        "ui": {
          "icon": "bi-person",
          "color": "#0ea5e9",
          "view": "tree"
        },
        "fields": [
          {
            "name": "nombre",
            "type": "text",
            "label": "Nombre",
            "required": true,
            "list": true,
            "filter": true,
            "readOnly": false
          },
          {
            "name": "slug",
            "type": "text",
            "label": "Slug",
            "required": true,
            "list": true,
            "filter": true,
            "readOnly": false
          }
        ]
      },
      "children": [
        {
          "slug": "directorio",
          "nombre": "Directorio",
          "orden": 1,
          "tipo": "subtabla",
          "activo": true,
          "props": {
            "db": {
              "table": "directorio",
              "softDelete": false
            },
            "ui": {
              "icon": "bi bi-gear",
              "color": "#0ea5e9",
              "view": "tree"
            },
            "fields": [
              {
                "name": "nombre",
                "type": "text",
                "label": "Nombre",
                "required": true,
                "list": true,
                "filter": true,
                "readOnly": false
              },
              {
                "name": "slug",
                "type": "text",
                "label": "Slug",
                "required": true,
                "list": true,
                "filter": true,
                "readOnly": false
              }
            ]
          }
        }
      ]
    },
    {
      "slug": "estados_obra_config",
      "nombre": "Estados",
      "orden": 2,
      "tipo": "tabla",
      "activo": true,
      "props": {
        "db": {
          "table": "estados_obra_config",
          "softDelete": false
        },
        "ui": {
          "icon": "bi-tag",
          "color": "#6b7280",
          "view": "list"
        },
        "fields": [
          {
            "name": "nombre",
            "type": "text",
            "label": "Nombre",
            "required": true,
            "list": true,
            "filter": true,
            "readOnly": false
          },
          {
            "name": "color",
            "type": "color",
            "label": "Color",
            "required": false,
            "list": true,
            "filter": false,
            "readOnly": false
          },
          {
            "name": "icono",
            "type": "text",
            "label": "Icono",
            "required": false,
            "list": true,
            "filter": false,
            "readOnly": false
          },
          {
            "name": "orden",
            "type": "number",
            "label": "Orden",
            "required": false,
            "list": true,
            "filter": false,
            "readOnly": false
          }
        ]
      }
    },
    {
      "slug": "servicios_config",
      "nombre": "Servicios",
      "orden": 3,
      "tipo": "tabla",
      "activo": true,
      "props": {
        "db": {
          "table": "servicios_config",
          "softDelete": false
        },
        "ui": {
          "icon": "bi-puzzle",
          "color": "#10b981",
          "view": "list"
        },
        "fields": [
          {
            "name": "nombre",
            "type": "text",
            "label": "Nombre",
            "required": true,
            "list": true,
            "filter": true,
            "readOnly": false
          },
          {
            "name": "color",
            "type": "color",
            "label": "Color",
            "required": false,
            "list": true,
            "filter": false,
            "readOnly": false
          },
          {
            "name": "icono",
            "type": "text",
            "label": "Icono",
            "required": false,
            "list": true,
            "filter": false,
            "readOnly": false
          }
        ]
      }
    }
  ]
}
] as const;
