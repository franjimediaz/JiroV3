import { SeedNode } from "@repo/types";

export const customersSeed: SeedNode[] = [
{
  "slug": "customers",
  "nombre": "Clientes / Pacientes",
  "orden": 2,
  "tipo": "tabla",
  "activo": true,
  "props": {
    "db": {
      "table": "clientes",
      "softDelete": true
    },
    "ui": {
      "icon": "bi-person",
      "color": "#5cf4ff",
      "view": "list"
    },
    "fields": [
      {
        "name": "name",
        "type": "text",
        "label": "Nombre",
        "required": true,
        "list": true,
        "filter": true,
        "readOnly": false,
        "appareance": "Always",
        "allowOverride": false,
        "compute": {
          "type": "none"
        },
        "ui": {
          "width": "1/2",
          "variant": "richtext"
        },
        "help": "Nombre del cliente"
      },
      {
        "name": "surname",
        "type": "text",
        "label": "Apellido",
        "required": true,
        "list": true,
        "filter": true,
        "readOnly": false,
        "appareance": "Always",
        "ui": {
          "width": "1/2"
        }
      },
      {
        "name": "direction",
        "type": "text",
        "label": "Dirección",
        "required": false,
        "list": false,
        "filter": false,
        "readOnly": false,
        "appareance": "Zoom",
        "ui": {
          "width": "1/2"
        }
      },
      {
        "name": "dni",
        "type": "text",
        "label": "DNI",
        "required": false,
        "list": false,
        "filter": false,
        "readOnly": false,
        "appareance": "Zoom",
        "ui": {
          "width": "1/2"
        }
      },
      {
        "name": "email",
        "type": "text",
        "label": "Email",
        "required": true,
        "list": false,
        "filter": false,
        "readOnly": false,
        "appareance": "Always",
        "ui": {
          "width": "1/2"
        }
      },
      {
        "name": "phone",
        "type": "number",
        "label": "Teléfono",
        "required": false,
        "list": false,
        "filter": false,
        "readOnly": false,
        "appareance": "List",
        "ui": {
          "width": "1/3"
        }
      },
      {
        "name": "created_at",
        "type": "datetime",
        "label": "Creado En",
        "required": false,
        "list": false,
        "filter": false,
        "readOnly": true,
        "visible": true,
        "appareance": "Zoom",
        "ui": {
          "width": "1/3"
        }
      },
      {
        "name": "test",
        "type": "textarea",
        "label": "Nuevo campo",
        "required": false,
        "list": false,
        "filter": false,
        "readOnly": false,
        "ui": {
          "variant": "richtext"
        }
      }
    ],
    "formSections": [
      {
        "id": "section_1",
        "label": "Identificación",
        "description": "Identificación del paciente / cliente",
        "fields": [
          "name",
          "surname"
        ]
      },
      {
        "id": "section_2",
        "label": "Datos",
        "description": "Datos del cliente",
        "fields": [
          "direction",
          "dni",
          "email",
          "phone"
        ]
      },
      {
        "id": "section_3",
        "label": "Tracking",
        "fields": [
          "created_at",
          "test"
        ]
      }
    ]
  }
}
] as const;
