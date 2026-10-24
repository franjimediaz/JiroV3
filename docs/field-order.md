# Orden de campos y menú del configurador

El orden canónico es exclusivamente el array `schema.fields`. No se añaden propiedades
`position`, `order`, `orden` ni identificadores persistentes a los campos.

## Arrastre

Se utilizan `@dnd-kit/core` 6.3.1, `@dnd-kit/sortable` 10.0.0 y
`@dnd-kit/utilities` 3.2.2, fijados en el paquete UI y en el lockfile.
`SortableFieldList` se reutiliza en Campos, en cada sección y en los campos sin sección.
El handle `bi-grip-vertical` inicia el arrastre; el menú de acciones mantiene sus tres puntos.
Los inputs y botones del editor no son activadores de arrastre.

PointerSensor requiere ocho píxeles de movimiento. `touch-action: none` se aplica solo
al handle; el resto de la tarjeta permite hacer scroll. KeyboardSensor utiliza
sortableKeyboardCoordinates: espacio/Enter para tomar y soltar, flechas para mover,
Escape para cancelar. El modo de solo lectura deshabilita el ordenamiento.

Los nombres no están garantizados como únicos por el editor/raw JSON. Cada lista usa
un WeakMap con identificadores efímeros asociados a los objetos Field, independientes
del índice y del nombre. Se conservan al reordenar los mismos objetos. Al aplicar un
objeto editado o reemplazar el schema desde JSON se crean las identidades necesarias;
no se conserva una sesión modal pendiente a través de un reemplazo completo del schema.

Solo `onDragEnd` confirma el movimiento. `arrayMove` mueve el objeto completo en una
copia del array global y actualiza conjuntamente `propsObj` y `rawText`. No hay llamadas
al servidor durante el gesto: el botón Guardar conserva el mecanismo existente.
Dentro de una sección se reordena contra los índices globales; el arrastre no cambia
la pertenencia de campos entre secciones. Para moverlos entre secciones se usa su selector.

## JSON y formularios

El JSON refleja inmediatamente el orden nuevo. «Aplicar JSON al editor» valida y aplica
la edición raw sin guardarla en servidor. Guardar con el JSON abierto mantiene el flujo
existente de parsear, normalizar y guardar ese JSON. Un JSON inválido muestra un error.

El formulario plano recorre `schema.fields` sin ordenar. Dentro de cada sección,
`orderedSectionFields` filtra ese mismo array por los nombres pertenecientes a la sección.
Las secciones conservan su propio orden; no intercalan campos de distintas secciones.
Si hay secciones configuradas, los campos normales sin sección quedan ocultos del formulario.
Los ReverseLinks asignados se muestran dentro de su sección; los restantes se muestran
al final, en orden global, usando el bloque histórico de relaciones con ModuleTabs,
card y ReverseLinkTable, tras aplicar las mismas reglas de visibilidad de renderField.
La pertenencia se evalúa por tab.
Sin secciones se muestran todos en su orden global. El configurador sigue permitiendo
reordenar y asignar los campos sin sección.
Los ReverseLink mantienen su tratamiento especial existente.

Eliminar un campo limpia las referencias de las secciones legacy y de las pestañas
de formulario (si no queda otro campo con ese mismo nombre). Renombrar actualiza las
referencias de esas secciones. Los schemas con nombres duplicados siguen siendo ambiguos
para las referencias por nombre; el arrastre distingue sus objetos pero no corrige el schema.

Se han eliminado Subir/Bajar y sus callbacks de FieldRow y sus tres listas. Los controles
de orden de pestañas/secciones son independientes y se conservan.

## Iconos

ActionMenu insertaba `item.icon` directamente como contenido. Por eso se veían strings
como `bi bi-copy`. Ahora el componente compartido MenuIcon transforma `bi-copy` y
`bi bi-copy` en un elemento `i` con clases Bootstrap Icons y `aria-hidden`. Los iconos
React personalizados se conservan, igual que el ancho de alineación `am-icon` existente.
También se corrige Duplicar: añade una copia completa con nombre disponible en lugar
de reemplazar el campo original.

## Verificación

`scripts/field-order.test.mjs` cubre movimiento A/B/C → A/C/B, conservación del objeto,
JSON y normalización/recarga, pertenencia y orden de secciones, campos sin sección,
nombres duplicados, renombrado/eliminación de referencias, copia independiente,
renderizado real de iconos a HTML y confirmación/cancelación de drag con sensores.
Las pruebas de ConfigEditor existentes siguen cubriendo Aplicar/Cancelar y edición anidada.
La recarga se verifica mediante serialización/normalización, sin guardar un módulo real.

Referencias: [sortable de dnd-kit](https://dndkit.com/legacy/presets/sortable/overview/)
y [PointerSensor](https://dndkit.com/legacy/api-documentation/sensors/pointer/).
