# Revisión de búsqueda avanzada

## Alcance y evidencia

Verificación de solo lectura contra el proyecto Supabase configurado en
`apps/web/.env.local`. No se han modificado datos, schemas, permisos ni FKs.

El script `scripts/advanced-search-live-readonly.mjs` ejecuta el compilador real y
el cliente Supabase contra PostgREST remoto. Para el caso de página fuera de rango
también invoca el handler real de `/api/list`. El transporte rechaza cualquier
método distinto de GET/HEAD. Solo imprime resultados agregados, no credenciales
ni valores de negocio.

**Límite de esta evidencia:** utiliza la credencial de servidor configurada;
inyecta la autorización y el contexto de usuario al invocar el handler. Por tanto,
prueba consultas/errores reales, pero no una sesión Next autenticada ni RLS por
usuario. Los tests de API comprueban por separado los rechazos de permisos.

Repetir explícitamente (no forma parte de la suite automática):

```powershell
node scripts/advanced-search-live-readonly.mjs --readonly
```

El script depende de los schemas/datos actuales de Jiro. Si cambia la configuración,
hay que revisar sus fixtures; no hay que crear datos ni activar campos para hacerlo pasar.

## Resolución exacta de relaciones

1. El cliente envía el nombre de un selector del módulo raíz, nunca una tabla/FK.
2. El servidor exige que ese campo exista, tenga `filter === true`, no sea virtual
   y sea `selectorTabla` de valor único.
3. Resuelve `ref.moduleSlug` mediante la configuración del módulo y exige permiso
   `ver` sobre el módulo relacionado. La tabla sale de ese schema.
4. El campo destino también debe existir en su schema, tener `filter === true` y
   admitir el operador y tipo de valor solicitados.
5. Genera un alias vacío por condición: `jiro_search_0:customers!customer()`.
   `customer` es una **pista por columna de origen**, no un nombre de constraint
   inventado. PostgREST resuelve la relación contra su caché de FKs físicas.

Comprobado con nombres distintos de la columna:

| Configuración | FK física | Resultado real |
| --- | --- | --- |
| `py.customer → customers` | `py_customer_fkey` | Correcto |
| `task.obraId → py` | `TASK_obraId_fkey` | Correcto, incluidas mayúsculas |
| `materialstask.material → materials` | `materials-task_material_fkey` | Correcto, incluido guion en la FK |

No se consulta el catálogo físico en cada búsqueda ni se generan FKs. Si PostgREST
no reconoce la pareja tabla/columna (`PGRST200`) o encuentra varias relaciones
(`PGRST201`), la API devuelve 400 descriptivo. No reintenta con otra tabla o sin pista.

**Configuración incompatible encontrada, sin modificar:** el schema de
`budget_task.budgetId` refiere `py`, mientras `budget_task_budgetId_fkey` referencia
`budget(id)`. La consulta real devuelve `PGRST200`. Una FK existente hacia otra
tabla no basta. También se verificó `PGRST201` con la relación ambigua sin pista
entre `budget_task` y `budget_material`.

## AND/OR, grupos y consulta final

Cada filtro relacionado se aplica al alias; `alias.not.is.null` expresa existencia
en el árbol lógico raíz. No se usa `!inner`, pues descartaría las filas que solo
cumplen la rama local de un OR. Ejemplo de parámetros finales decodificados:

```text
/rest/v1/py
select=*,jiro_search_0:customers!customer()
jiro_search_0.or=(name.eq."ejemplo")
or=(and(or(title.eq."ejemplo",jiro_search_0.not.is.null)))
order=title.asc,id.asc
offset=0
limit=10
Prefer: count=exact
```

Los filtros por defecto del módulo raíz se añaden con AND al árbol completo.
Los del módulo relacionado se añaden con AND dentro de cada alias. Se conservan
sus grupos OR. Estos filtros configurados en servidor pueden usar campos que no
están disponibles como filtros interactivos.

Verificado en las tres relaciones anteriores:

- AND, OR y `(A OR B) AND B`, con predicados locales y relacionados.
- Una rama relacionada sin coincidencias no elimina las coincidencias locales de OR.
- Igualdad con un texto relacionado existente y literales con comillas, paréntesis
  y barras: no se interpretan como fragmentos de consulta.
- `count` cumple la identidad de conjuntos `A OR B = A + B - (A AND B)`.
- Segunda página, count independiente del rango y orden ascendente/descendente.
- Los conjuntos de la prueba tenían respectivamente 14, 26 y 11 filas; no son
  valores fijos exigidos por el script.

**Regresión corregida:** con `count=exact`, un offset posterior a la última fila
devuelve `416/PGRST103` y count nulo. Antes acababa como 500. Ahora el handler
recupera el count con rango 0–0 y exactamente los mismos predicados; devuelve
una página vacía con ese total. El cliente puede corregir su página. No devuelve
accidentalmente las filas de la primera página. Solo este error hace una lectura extra.

## Validación y límites

- Los filtros interactivos rechazan campos no declarados, `filter` ausente/false,
  `"true"`/1, virtuales, relaciones no configuradas, operadores no permitidos y
  valores inválidos. Los tests incluyen campos raíz y relacionados.
- Los identificadores deben pertenecer al schema y superar la validación sintáctica;
  los valores se codifican como literales PostgREST escapados. El cliente no envía
  SQL, selects ni fragmentos OR. Los intentos de cambiar tabla/select se ignoran;
  los campos de ordenación inyectados se rechazan.
- `filter: true` controla los **predicados interactivos**. No es un permiso de
  lectura de columnas: el ListView conserva su proyección existente `*`, y permite
  ordenar por campos declarados no virtuales aunque no sean filtrables.
- La API sigue usando el cliente de sesión del usuario en producción. No se ha
  incorporado ninguna credencial privilegiada al código de aplicación.
- Los tests cubren permisos raíz/relacionados, exportación, capabilities,
  defaults relacionados y errores PGRST200/PGRST201/PGRST103.

## Comprobaciones manuales pendientes

1. Con una sesión real sin permiso `ver` del módulo relacionado, enviar un filtro
   manipulado: debe dar 403 antes de consultar registros de negocio.
2. Con dos usuarios con distintas políticas RLS, comparar filas/count/exportación.
   La prueba con credencial de servidor no demuestra aislamiento por usuario.
3. Validar defaults dependientes de `CurrentUser` con una sesión real.
4. Para configuraciones con `ref.valueField` personalizado, verificar que la FK
   referencia esa columna. El join físico lo determina PostgREST; el compilador
   no compara metadatos de `valueField` con el catálogo. Tampoco se han verificado
   FKs compuestas, relaciones autorreferentes o vistas; no se amplía su soporte.
5. Corregir, si procede, la configuración incompatible de `budget_task.budgetId`
   por el procedimiento habitual del proyecto. Esta revisión no la modifica.

Referencias: [PostgREST: OR sobre recursos relacionados](https://postgrest.org/en/stable/references/api/resource_embedding.html#or-filtering-across-embedded-resources),
[FKs y resolución de relaciones](https://postgrest.org/en/stable/references/api/resource_embedding.html#foreign-key-joins).
