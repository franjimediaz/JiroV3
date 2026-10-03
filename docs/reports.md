# Informes (MVP)

`/informes` ofrece definiciones personales LIST/MATRIX. El acceso global está
encima de Mi cuenta, tanto en desktop/mini como en el drawer móvil.

## Componentes y flujo

- `packages/types/reports.ts`: definiciones serializables, referencias estables
  `{relation?, field}`, inventario de campos y compatibilidad de agregaciones.
- `apps/web/lib/reports/definition.ts`: validación estructural y límites.
- `server.ts`: resuelve módulos y campos contra metadata del servidor, valida
  permisos actuales, ejecuta la consulta con el cliente Supabase de sesión.
- `transform.ts`: agrupaciones LIST y pivot MATRIX independientes de React.
- `ReportDesigner.tsx`, `ReportResultView.tsx`, `ReportsClient.tsx`: diseñador,
  resultados y CRUD. Drag & drop nativo y botones equivalentes para teclado/móvil.
- `apps/web/app/api/reports/route.ts`: listar, metadata, guardar, preview, ejecutar
  por ID y eliminar. Un informe guardado siempre se ejecuta desde su definición
  persistida, con nueva validación de campos/permisos.

Se reutilizan `AdvancedFilterBuilder`, `FilterExpressionSummary`, `ModalConfirm`,
el compilador de búsqueda avanzada, defaults de módulo, `ListView`, `ActionMenu`
y la paleta de `Form`. No existe otro formato/motor de filtros. El modal de filtros
edita un borrador; Aplicar no ejecuta consultas. Preview no guarda definiciones.

## Persistencia y permisos

La migración `20261003193755_create_report_definitions.sql` está aplicada al
proyecto Supabase configurado. Solo crea la tabla de definiciones, su índice,
políticas RLS y trigger de timestamps; no altera tablas de negocio.

`report_definitions.config` guarda la definición completa, nunca resultados.
Las definiciones son personales: cada usuario autenticado gestiona las suyas.
RLS comprueba `auth.uid() = owner_id` para SELECT/INSERT/UPDATE/DELETE, incluida
la prohibición de transferir propiedad. `anon` no tiene privilegios. La API
también añade el propietario de sesión a sus consultas; ignora propietarios
enviados por el cliente.

No se añade un rol nuevo. Consultar datos requiere `ver` en el módulo raíz y en
cada módulo relacionado utilizado, y `allowSearch` en el raíz. Los filtros siguen
exigiendo `filter: true`. Las columnas del informe pueden usar campos persistidos,
escalares y visibles declarados en el schema aunque no sean filtrables. Los
defaults de raíz y relacionados se conservan; RLS sobre datos de negocio sigue
aplicándose mediante el cliente de sesión.

## Ejecución y límites

PostgREST del proyecto devuelve `PGRST123` para agregaciones SQL (`pu.sum()`).
Por eso las agrupaciones/agregaciones se calculan en el **servidor de aplicación**,
sin habilitar capacidades globales ni añadir SQL dinámico. Solo se proyectan los
campos elegidos y los filtros los ejecuta PostgREST. El navegador recibe el
resultado limitado/agregado, no las tablas de origen.

- Máximo 5.000 registros de origen, 15 segundos de lectura y 20 páginas de lectura.
  Si se supera el límite, se rechaza el informe: nunca se presentan agregados
  de un dataset truncado. El cambio de count durante la lectura obliga a reintentar.
- LIST: 20 columnas, tres criterios de orden, 1.000 grupos. Las columnas sin
  agregación forman el agrupamiento si existen medidas. Preview muestra hasta
  100 resultados y la ejecución hasta 1.000, indicando si quedan más resultados.
- MATRIX: hasta dos dimensiones de filas, dos de columnas y cinco medidas;
  máximo 100 filas, 50 columnas y 10.000 celdas. Totales calculados desde valores
  de origen: no se suman medias ni recuentos distintos de celdas.
- `count` cuenta valores no nulos; `countDistinct` excluye null. `sum`/`avg` solo
  aceptan campos numéricos. Sumas/medias sin valores devuelven null.
- Solo relaciones directas `selectorTabla` de valor único, respaldadas por una
  FK reconocida por PostgREST. No hay joins libres, relaciones múltiples/inversas,
  campos virtuales ni fórmulas. Un selector muestra su ID si se usa directamente;
  elige el campo descriptivo relacionado para mostrar su nombre.
- No se derivan años/meses automáticamente: se usan campos existentes. Las
  referencias no dependen de etiquetas. No hay gráficos, exportación ni programación.
- El listado muestra las 200 definiciones personales más recientes.

## Verificación

```powershell
pnpm check-types
node --test scripts/reports.test.mjs scripts/advanced-search.test.mjs scripts/module-capabilities.test.mjs scripts/security-hardening.test.mjs
node scripts/reports-ui-check.cjs
node scripts/reports-live-readonly.mjs --readonly
```

Pruebas reales de lectura: LIST y MATRIX sobre `task → py`, 26 registros de
origen y 11 grupos en el momento de la revisión, totales consistentes. El script
usa una credencial de servidor y **no prueba permisos de datos de un usuario**.
Los permisos del motor/API tienen pruebas de rechazo separadas.

`supabase/tests/report_definitions_rls.sql` se ejecutó contra la DB real:
CRUD del propietario, rechazo de otro usuario y de transferencia de propiedad,
y ausencia de grants a anon. Todo el test se revierte con ROLLBACK. Los advisors
no detectaron incidencias nuevas para la tabla/función de informes.

El navegador prueba componentes reales con transporte simulado: drag & drop,
reordenado, filtros, preview, guardar, ejecutar, editar y eliminar, más layout
desktop/móvil. Queda la comprobación extremo a extremo con una sesión real y
sus políticas RLS de negocio. Las lecturas paginadas no constituyen un snapshot
transaccional: cambios concurrentes que no alteren el count pueden afectar el resultado.
