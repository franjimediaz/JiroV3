# Permisos de sistema y JSON de módulos

## Roles

`SYSTEM_PERMISSION_GROUPS` en `packages/types/systemPermissions.ts` deriva las
acciones de workflows de `WORKFLOW_CATALOG`. Incluye `run` y todos los workflows
registrados, incluido `budget.generateFromTasks`. No crea filas en `modulos` ni
amplía `AccionModulo` con acciones técnicas.

Los permisos siguen siendo claves planas: `perms.workflows["records.copyRelated"]`.
El editor conserva los namespaces no mostrados. Activar `run` no activa ninguna
acción específica. El backend sigue exigiendo ambas concesiones. Las concesiones
globales explícitas existentes se muestran como heredadas y no se revocan mediante
un checkbox específico, porque el backend no interpreta `false` como un veto a `*`.

El PUT de Roles mantiene el cliente de usuario y sus políticas existentes. Valida
objetos de booleanos y nombres de permisos (incluidos puntos), rechaza arrays,
objetos anidados como acciones y nombres de prototipo. Conserva la concesión legacy
de namespace `true` y los comodines explícitos. No introduce comodines nuevos.

## Lectura y escritura

`normalizeModuleSchema`: JSON legacy → modelo de runtime compatible.

`serializeModuleSchema`: editor/runtime → `PersistedModuleSchema`, sin aliases de
runtime. Lo usan el JSON avanzado, el guardado del configurador, la acción de
servidor `upsertModuloAction` y la exportación de seeds. No se ejecuta ninguna
migración masiva ni se escribe en la base de datos por abrir un módulo.

| Configuración | Persistencia | Compatibilidad de lectura |
| --- | --- | --- |
| Tabla del registro | `db.table` | `table` en raíz |
| Apariencia | `fields[].appearance` | `appareance`, generado también en runtime |
| PlanEditor | `config.sourceField`, `config.options` | aliases superiores; config tiene precedencia |
| Secciones | `ui.tabs[].config.formSections`, nombres en `fields` | `ui.formSections` y `formSections` legacy |
| Calendario | `sourceModuleSlug` | `sourceTable` legacy |
| TreeView nuevo | `source.moduleSlug` | `source.table`/`sourceTable` legacy; alias temporal en runtime |
| Crear relacionado nuevo | `target.moduleSlug` | `target.table` legacy |

No se adivina que una tabla física legacy sea un slug. Se conserva `target.table`
si no existe `moduleSlug`; al elegir de nuevo el módulo en el editor se guarda el
slug. El API de creación resuelve el módulo a `db.table`. Las fuentes físicas de
workflows conservan sus nombres y semántica. Las referencias de campos ya usan
`ref.moduleSlug`; no se hace una sustitución global de `table`.

El serializer mantiene el orden de `fields`, las referencias de sección y los
valores literales, incluidos `""`, `null`, `false`, `0`, arrays y objetos en defaults
y filtros. Solo omite vacíos en opciones identificadas, como `after.navigateTo`,
`hrefTemplate` y campos opcionales del calendario. No aplica una limpieza recursiva
de valores vacíos. Una segunda serialización produce el mismo JSON.

## Acciones y workflows

Cambiar `type` elimina el payload del tipo anterior y conserva presentación,
visibilidad, confirmación, ubicación y condiciones. Cambiar `workflowKey` reinicia
`input`. Editar otra propiedad no reinicia el workflow. Los workflows desconocidos
conservan su input, y siguen sujetos al registro ejecutable del backend.

`records.copyRelated` persiste `source` (tabla y match), `target` (tabla y FK padre),
`map`, `defaults`, `dedupe` y `children`. Los hijos tienen `source.parentField` en
lugar de `source.match`. No almacena `kind`, `maps.parent` ni `parentTable` de derive.

`derive.createFromParent` persiste `source.parentTable`, `target.parentTable`,
`maps.parent`, `defaults.parent`, `sourceUpdates.parent`, `children` e `idempotency`.
Cada hijo contiene tablas, FKs, `map`, `defaults`, `filters` y `sourceUpdates`.
La configuración legacy de un hijo se convierte a `children[]` con sus valores.
`kind` y `source.parentIdTemplate` no se guardan: el runtime usa `context.recordId`.
El campo de plantilla inoperante se ha retirado del editor.

`budget.generateFromTasks` conserva su contrato propio de un hijo legacy: su
implementación consume `source.children` y `target.children`, por lo que no se le
aplica la conversión de derive a `children[]`.

## Campos virtuales

Form muestra los ReverseLinks como tablas relacionadas, consultadas por
`ref.moduleSlug` y `foreignKey`. No son columnas del padre. Normalizador y
serializer establecen `virtual: true`; el editor no permite desmarcarlo y el filtro
compartido de INSERT/UPDATE los excluye incluso si el schema raw contiene false.
Un `id` virtual sigue excluido de CREATE y no cambia el comportamiento de la PK.

Los warnings legacy incluyen aliases de PlanEditor, referencias `table` junto a
identidades modernas y ReverseLinks no virtuales. Revisarlos permite detectar
configuraciones antiguas sin modificarlas en bloque.

## Comprobación

`scripts/module-serialization.test.mjs` cubre round-trip, idempotencia, literales,
workflows y exclusión de ReverseLinks. `scripts/system-permissions.test.mjs` cubre
catálogo, edición inmutable, validación y el PUT de Roles con cliente simulado.
Las suites de workflows, persistencia CRUD, orden de campos y Record name cubren
las integraciones existentes. No requieren modificar roles ni módulos reales.
