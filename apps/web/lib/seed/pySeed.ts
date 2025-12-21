import { SeedNode } from "@repo/types";

export const pySeed: SeedNode[] = [
{
  "slug": "py",
  "nombre": "Proyectos",
  "orden": 3,
  "tipo": "tabla",
  "activo": true,
  "props": {
    "db": {
      "table": "proyectos",
      "softDelete": true
    },
    "ui": {
      "icon": "bi-house",
      "color": "#2563eb",
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
        "name": "clienteId",
        "type": "selectorTabla",
        "label": "Cliente",
        "required": true,
        "list": true,
        "filter": true,
        "readOnly": false
      },
      {
        "name": "estadoId",
        "type": "selectorTabla",
        "label": "Estado",
        "required": false,
        "list": true,
        "filter": true,
        "readOnly": false
      }
    ]
  },
  "children": [
    {
      "slug": "tareas",
      "nombre": "Tareas",
      "orden": 1,
      "tipo": "tabla",
      "activo": true,
      "props": {
        "db": {
          "table": "tareas",
          "softDelete": true
        },
        "ui": {
          "icon": "bi-file",
          "color": "#8b5cf6",
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
            "name": "obraId",
            "type": "selectorTabla",
            "label": "Obra",
            "required": true,
            "list": true,
            "filter": true,
            "readOnly": false
          }
        ]
      }
    },
    {
      "slug": "presupuestos",
      "nombre": "Presupuestos",
      "orden": 2,
      "tipo": "tabla",
      "activo": true,
      "props": {
        "db": {
          "table": "presupuestos",
          "softDelete": false
        },
        "ui": {
          "icon": "bi-file",
          "color": "#0ea5e9",
          "view": "list"
        },
        "fields": [
          {
            "name": "descripcion",
            "type": "textarea",
            "label": "Descripción",
            "required": false,
            "list": true,
            "filter": false,
            "readOnly": false
          },
          {
            "name": "obraId",
            "type": "selectorTabla",
            "label": "Obra",
            "required": true,
            "list": true,
            "filter": false,
            "readOnly": false
          }
        ]
      },
      "children": [
        {
          "slug": "presupuesto_servicios",
          "nombre": "Presupuesto Servicios",
          "orden": 1,
          "tipo": "subtabla",
          "activo": true,
          "props": {
            "db": {
              "table": "presupuesto_servicios",
              "softDelete": false
            },
            "ui": {
              "icon": "bi-file",
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
                "filter": false,
                "readOnly": false
              },
              {
                "name": "presupuestoId",
                "type": "selectorTabla",
                "label": "Presupuesto",
                "required": true,
                "list": false,
                "filter": false,
                "readOnly": false
              }
            ]
          },
          "children": [
            {
              "slug": "presupuesto_tareas",
              "nombre": "Presupuesto Tareas",
              "orden": 1,
              "tipo": "subtabla",
              "activo": true,
              "props": {
                "db": {
                  "table": "presupuesto_tareas",
                  "softDelete": false
                },
                "ui": {
                  "icon": "bi-file",
                  "color": "#f59e0b",
                  "view": "list"
                },
                "fields": [
                  {
                    "name": "nombre",
                    "type": "text",
                    "label": "Nombre",
                    "required": true,
                    "list": true,
                    "filter": false,
                    "readOnly": false
                  },
                  {
                    "name": "presupuestoServicioId",
                    "type": "selectorTabla",
                    "label": "Capítulo",
                    "required": true,
                    "list": false,
                    "filter": false,
                    "readOnly": false
                  }
                ]
              }
            }
          ]
        }
      ]
    },
    {
      "slug": "materiales",
      "nombre": "Materiales",
      "orden": 3,
      "tipo": "tabla",
      "activo": true,
      "props": {
        "db": {
          "table": "materiales",
          "softDelete": false
        },
        "ui": {
          "icon": "bi-file",
          "color": "#ef4444",
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
            "name": "precioUnidad",
            "type": "money",
            "label": "€/ud",
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
