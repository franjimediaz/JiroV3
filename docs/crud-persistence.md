# Persistencia de campos del CRUD dinámico

La selección común vive en `packages/types/persistablePayload.ts`, sin dependencias
de servidor. FormClient, FormClientLegacy y las APIs utilizan la misma definición:
campo declarado, no virtual, compute.persist distinto de none y no controlado por
servidor. Se omiten propiedades undefined sin convertirlas en null.

`buildPersistablePayload` valida en servidor las claves contra el schema resuelto,
rechaza campos controlados por servidor, aplica la selección y finalmente normaliza
solo las relaciones presentes en el payload final. No modifica el objeto entrante.

- Los virtuales declarados se aceptan y descartan, también si son la PK.
- Los compute con persist=none se aceptan y descartan; onSave/always se conservan.
- Las claves no declaradas dan 400, incluida una PK enviada dentro de data que no
  esté declarada en fields. No hay excepciones para id ni para nombres de tablas.
- Create omite la PK configurada cuando es virtual/no persistible o su valor es
  null, undefined, vacío o solo espacios. Una PK manual persistible y no vacía se
  conserva. Si no se proporciona PK, el insert deja actuar al default de la DB.
- Update nunca cambia la PK: el body.id externo a data localiza el registro mediante
  eq(resolved.primaryKey, recordId), aunque la PK física tenga otro nombre.
- Los campos controlados por servidor se rechazan aun cuando estén declarados
  virtuales. Se mantiene la lista anterior completa.
- Las reglas UI de readOnly no se convierten en un bloqueo global de persistencia:
  los cálculos persistidos pueden ser readOnly. La PK sí se excluye siempre de update.

Antes del cambio, las APIs excluían virtuales de allowedFields, pero exceptuaban id
y resolved.primaryKey de la validación y enviaban el payload original a insert/update.
Así id:null sobrevivía y anulaba el default UUID; otros virtuales daban un 400 erróneo.

La auditoría fieldNames ahora enumera las claves del payload final enviado a la DB.
En caso de error de base de datos refleja los campos intentados, no una confirmación
de persistencia; si falla la validación, queda vacía. No se registran valores.

Se mantiene la sanitización de strings vacíos del formulario y la normalización
existente de selectorTabla/UUID. Address, JSON, arrays y cálculos conservan sus valores.
listDataIO ya excluía virtuales y compute.persist=none; sus solicitudes quedan también
protegidas por las APIs. No hay cambios en credenciales, permisos, RLS ni esquema SQL.

Las pruebas de `scripts/crud-persistence.test.mjs` invocan las rutas reales con un
cliente Supabase simulado y comprueban los argumentos de insert/update/eq y auditoría.
No escriben registros de prueba en la base de datos real. La respuesta de create
mantiene select("*").single() para devolver la PK generada, conforme al contrato
de [insert de Supabase](https://supabase.com/docs/reference/javascript/insert).
