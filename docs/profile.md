# Mi perfil

`/mi-perfil` y `/api/profile` utilizan `requireUser()` (sesión verificada con Auth). El UID nunca se acepta del cliente. El cliente privilegiado solo accede al UID de esa sesión y a campos explícitos; los roles no son editables. Los POST requieren JSON y origen idéntico. Nombre/apellidos, email y contraseña se guardan mediante operaciones separadas.

## Email

Auth es la fuente de verdad. Se guardan primero ambos emails anteriores en `profile_email_changes`, con acceso exclusivo del servidor. Un índice único impide dos operaciones abiertas del mismo usuario, también entre instancias. No se guardan contraseñas ni tokens en este registro.

1. Validar la solicitud y comprobar el estado actual. Una inconsistencia previa bloquea el cambio y se registra para revisión.
2. Persistir `starting` antes de solicitar el cambio en Auth. Se usa `auth.updateUser`, conservando las confirmaciones configuradas en Supabase.
3. Mientras Auth conserve el email anterior, devolver `pending_confirmation`, nunca éxito. El usuario confirma los correos y pulsa **Comprobar confirmación**.
4. Reclamar atómicamente la operación (`pending_confirmation` → `applying`). Actualizar `users.email` condicionado a su valor anterior. Leer Auth y DB y cerrar como `completed` solo si coinciden con el destino.
5. Si falla DB, comprobar si hubo commit pese al error de transporte. Si DB conserva el valor anterior, restaurar Auth al email anterior y verificar ambos valores. Devolver error también después de una compensación correcta (`rolled_back`).
6. Si falla la reversión, hay cambios externos o no puede conocerse el resultado, registrar el error técnico sin emails/secretos y marcar `reconciliation_required`. Si el propio registro falla, `starting`/`applying` permanece abierto: nunca se borra ni caduca automáticamente.

Configurar en Supabase Auth → URL Configuration la URL del entorno `https://<dominio>/auth/profile-callback` como redirect permitido. El callback intercambia el código PKCE y vuelve a Mi perfil; no declara éxito ni escribe en DB. Abrir el enlace en el navegador que inició el cambio. Si Supabase redirige al Site URL, también se puede volver manualmente a Mi perfil y comprobar la confirmación con sesión activa.

## Reconciliación operativa

Revisar `reconciliation_required` y las operaciones `starting`/`applying` antiguas con acceso de backend. No desbloquearlas por tiempo: el proceso original podría seguir ejecutándose. Revisar el `operationId` de los logs, verificar que no hay petición en vuelo y leer Auth y DB actuales. Conservar los snapshots, decidir el valor correcto con el titular y reparar únicamente el valor discordante. Volver a leer ambas fuentes antes de cerrar como `completed` o `rolled_back`; mantener abiertas las incidencias sin resolver. Las confirmaciones caducadas también requieren revisión antes de liberar el bloqueo.

El bloqueo coordina esta API, no modificaciones externas desde el dashboard o APIs administrativas. La escritura en DB usa comparación del valor anterior; Auth no ofrece compare-and-swap. No modificar credenciales externamente durante una operación abierta.

## Contraseña

Solo Auth almacena la contraseña. Se valida longitud (12–128), repetición y diferencia con la anterior. Una sesión temporal autentica la contraseña actual y el UID; `updateUser` conserva las políticas de Auth, sin usar la API administrativa para saltarlas. Esa sesión temporal se cierra al terminar. Un error de seguridad/MFA se muestra como error, nunca como éxito.

## Validación

`node --test scripts/profile.test.mjs` cubre validación, autorización, confirmación pendiente, sincronización inmediata, concurrencia, compensación, reversión fallida y resultados de transporte inciertos. La migración se verificó en Supabase real: existe `surname`, RLS activo y sin privilegios para `anon`/`authenticated` sobre el diario. El aviso informativo «RLS Enabled No Policy» es intencionado en esta tabla exclusiva del backend ([documentación](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)).

No se cambian credenciales reales para ejecutar las pruebas. Antes de publicar, comprobar con una cuenta de pruebas la entrega de ambos correos, el redirect permitido, el callback PKCE y la política de contraseña/MFA configurada en el entorno.
