# Referencias de campos (`FieldRef`)

Jiro usa un único contrato para toda configuración que **lee** el valor de un campo:

```ts
type FieldRef = {
  field: string;
  relations?: string[];
};
```

`relations` contiene nombres técnicos de campos `selectorTabla`, desde el módulo origen hacia fuera. No contiene labels, tablas, claves foráneas ni fragmentos SQL. La profundidad máxima es tres relaciones.

```json
{ "field": "title" }
```

```json
{ "relations": ["service", "category"], "field": "color" }
```

El segundo ejemplo se lee como `registro.service.category.color`. Las filas hidratadas por el backend conservan exactamente esa forma, y `getFieldRefValue(row, ref)` la lee sin hacer peticiones adicionales.

## Clasificación

La regla de decisión es semántica:

- **READ_FIELD_REF**: muestra, filtra, ordena, agrupa, compara, calcula o exporta un valor. Acepta `FieldRef`.
- **STRUCTURAL_DIRECT_FIELD**: identifica una columna física, una relación o una definición local. Sigue siendo `string`.
- **WRITE_DESTINATION_FIELD**: indica dónde escribir. Sigue siendo directo; el origen del valor puede ser `FieldRef`.

Inventario aplicado:

| Superficie | Referencias de lectura migradas | Referencias que siguen directas |
| --- | --- | --- |
| Informes | columnas y rutas relacionadas | ids/aliases propios del informe |
| Advanced Search | condición `field` | — |
| Filtros por defecto | condición `field` | — |
| Filtros de SelectorTabla | campo destino y campo leído del registro actual | — |
| SelectorTabla | `displayField`, icono, color, filtros y sort | `valueField` |
| Calendar | título, inicio, fin, all-day, color, descripción y recurso | `parentLinkField` |
| Visibilidad y acciones | campo comparado, `missingFields` | — |
| TreeView | columnas, agrupación, título de grupo, total, filtros y orden | campos estructurales padre/hijo y lookups legacy |
| PlanEditor | campos descriptivos/dinámicos, export subtitle y metadata | `sourceField`, `valueField` |
| Compute formula | `dependencies[].ref` | token de expresión y `deps` legacy |
| Compute aggregate | campo agregado, condiciones y valor leído de `this` | destino del cálculo |
| CreateRelated | valores de `fieldMap` | claves destino de `fieldMap` |
| ReverseLink | filtros y sort | `foreignKey`, `parentKey` |

También permanecen directos `db.primaryKey`, `Field.name`, `formSections[].fields`, campos padre de workflows, claves destino de mappings y `DuplicateAction.omitFields`.

## Compatibilidad y persistencia

Los normalizadores aceptan strings antiguos:

```json
{ "titleField": "title" }
```

y objetos nuevos. Al guardar, los serializers escriben la forma canónica estructurada:

```json
{ "titleField": { "field": "title" } }
```

Advanced Search continúa leyendo el par legacy `relation + field`, e Informes continúa leyendo `relation`, pero las ediciones nuevas escriben `relations[]`. No se ejecuta ninguna migración masiva de base de datos; cada configuración se normaliza al editarla.

## Resolución segura

`apps/web/lib/fields/resolveFieldRef.ts` valida cada salto contra el schema confiable:

1. el campo existe, es visible y no virtual;
2. cada relación es un `selectorTabla` simple;
3. el módulo destino procede de `field.ref.moduleSlug`;
4. la ruta no supera tres saltos ni contiene ciclos;
5. se comprueba permiso `ver` en todos los módulos atravesados.

El cliente nunca aporta tablas o SQL. Una ruta inválida falla antes de ejecutar la consulta.

## Consultas y anti-N+1

`apps/web/lib/fields/fieldRefQuery.ts` construye un árbol de relaciones para proyecciones, filtros y orden. Las rutas compartidas se deduplican, por ejemplo:

```text
service.name
service.color
service.category.name
```

producen un solo embed de `service` y uno de `category`. PostgREST devuelve filas hidratadas en una petición cuyo número de consultas no depende del número de registros. Los selectores múltiples también resuelven sus labels mediante un único filtro `in`.

Las proyecciones y los filtros admiten hasta tres relaciones. La ordenación del recurso principal por un campo relacionado admite una relación simple mediante la sintaxis `relation(field)` de PostgREST. PostgREST no soporta todavía esa ordenación principal a través de varias relaciones; Jiro rechaza esa configuración de forma explícita en vez de ordenar sólo el embed o paginar resultados en un orden incorrecto. Ampliarla requerirá una vista o función SQL deliberada, no una migración automática.

## Selector de UI

`RelatedFieldSelector` carga schemas con `dataProvider.getSchema`, mantiene una caché por `moduleSlug`, muestra campos directos y permite entrar en relaciones. `allowedField` restringe tipos incompatibles y `maxDepth` limita la navegación. Una ruta guardada que ya no existe se muestra como inválida y se conserva hasta que el usuario elija otra.

Ejemplos de restricciones:

```tsx
<RelatedFieldSelector
  sourceModuleSlug="tasks"
  value={config.startField}
  allowedField={(field) => field.type === "date" || field.type === "datetime"}
  onChange={(startField) => update({ startField })}
/>
```

```json
{
  "dependencies": [
    {
      "token": "service_price",
      "ref": { "relations": ["service"], "field": "price" }
    }
  ],
  "expr": "quantity * service_price"
}
```

```json
{
  "fieldMap": {
    "customerName": {
      "relations": ["customer"],
      "field": "name"
    }
  }
}
```
