# records.copyRelated

Acción genérica `ui.formActions` de tipo `workflow`. No requiere migrar acciones existentes.
Se configura en el editor visual «Copiar registros relacionados» o mediante input JSON.

```json
{
  "id": "generate_project_tasks",
  "label": "Generar tareas",
  "type": "workflow",
  "workflowKey": "records.copyRelated",
  "showIn": ["view", "edit"],
  "confirm": { "text": "¿Quieres generar las tareas de la plantilla seleccionada?" },
  "input": {
    "source": {
      "table": "template_task",
      "match": { "field": "template_id", "valueFromRecord": "template_id" }
    },
    "target": { "table": "task", "parentField": "project_id" },
    "map": { "name": "name", "description": "description", "priority": "priority" },
    "defaults": { "status": "pending" },
    "dedupe": { "enabled": true, "sourceIdField": "id", "targetSourceIdField": "template_task_id" }
  }
}
```

Los nombres del ejemplo deben corresponder a módulos/tablas y columnas existentes. No se crean tablas,
campos, índices ni permisos automáticamente. El usuario necesita `workflows.run` y
`workflows.records.copyRelated`, además del acceso que permitan las políticas RLS.

El contexto identifica el módulo actual mediante `moduleSlug`, `tableSlug` o `table` (en ese orden)
y el registro mediante `recordId`. El resolutor central acepta slugs y tablas físicas vinculadas a
módulos reales. Se utiliza la clave primaria configurada del módulo para leer el registro guardado;
los cambios de formulario aún sin guardar no intervienen en la búsqueda.

`map` expresa destino → origen. Primero se aplican `defaults`, después `map`, después `parentField`
y por último la identidad de deduplicación. Las identidades no pueden compartir columna con el padre.
Se copian valores literales, sin interpolación ni ejecución de código. Una relación actual nula o vacía
devuelve cero coincidencias. Un campo inexistente o una identidad ausente produce un error antes del insert.

La deduplicación omite destinos visibles cuyo padre e identidad de origen coinciden, incluyendo
identidades repetidas dentro del mismo lote. Devuelve `result: { matched, created, skipped }`.
Las consultas se paginan para respetar los límites de PostgREST sin truncar las coincidencias.

## Atomicidad y concurrencia

No hay una abstracción transaccional compartida en el motor actual. Las lecturas y la comprobación
de existentes son peticiones separadas; todo el lote nuevo se envía en una sola sentencia INSERT.
Un fallo de inserción se propaga, sin reintentar inserts individuales ni declarar éxito parcial.

La comprobación previa no garantiza exclusión entre ejecuciones simultáneas ni detecta filas ocultas
por RLS. Para garantizar unicidad concurrente, el responsable del módulo debe definir una restricción
UNIQUE apropiada sobre `(parentField, targetSourceIdField)` y políticas de lectura coherentes.
El workflow respeta las restricciones existentes: un conflicto UNIQUE aborta el lote y devuelve 409;
una nueva ejecución puede releer y omitir las filas ya creadas. No se presupone ni crea dicho índice.
Las lecturas tampoco constituyen una instantánea transaccional frente a cambios concurrentes.

`FormActionsBar` genera una `Idempotency-Key` por ejecución, sin guardarla en la acción. El endpoint
actual almacena respuestas completadas en memoria durante diez minutos; no es un bloqueo distribuido
ni cubre peticiones simultáneas en curso. Esta idempotencia HTTP no sustituye la deduplicación de negocio.

## Catálogo y compatibilidad

`packages/types/workflows.ts` contiene `WORKFLOW_KEYS` y metadatos seguros para cliente. El único
registro de handlers sigue en `apps/web/lib/workflows/index.ts`, tipado con todas esas claves.
Al añadir workflows, actualizar claves/metadatos y handler; `scripts/workflows.test.mjs` comprueba
su correspondencia. Las claves legacy desconocidas se conservan con aviso y editor JSON; el backend
sigue rechazando claves no registradas. `derive.createFromParent` y sus helpers legacy no cambian.

Pruebas: `node --test scripts/workflows.test.mjs`. Incluyen consultas simuladas, fallos de lote,
paginación, reejecuciones, tipos, catálogo, handlers legacy y eventos reales de componentes mediante
un harness de hooks. No sustituyen una prueba integrada con la base de datos y sus políticas RLS.
