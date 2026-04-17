# Flujos principales

## 1. Login y entrada al workspace

1. El usuario abre `/login`.
2. `login/page.tsx` autentica con `supabase.auth.signInWithPassword`.
3. El `proxy.ts` permite pasar a rutas protegidas si existe sesión.
4. El dashboard `/` consulta sesión y módulos activos.

## 2. Navegación por módulo dinámico

1. El layout principal carga módulos activos desde `modulos`.
2. `SidebarWithPerms` filtra opciones según `hasPermiso`.
3. El usuario entra en `/m/[slug]`.
4. La página server resuelve schema y filas.
5. `ListPageClient` muestra `ListView`.

## 3. Listar → ver → editar → guardar en módulo dinámico

1. Desde `/m/[slug]`, `ListView` ejecuta `onViewRow` u `onEditRow`.
2. Se navega a `/m/[slug]/[id]` con o sin `?edit=true`.
3. La página server carga fila y schemas auxiliares.
4. `FormClient` renderiza `Form`.
5. Al guardar:
   - sanitiza payload
   - actualiza con Supabase client
   - limpia `?edit=true`
   - refresca la ruta

## 4. Crear registro dinámico

1. Desde el listado, `onCreate` navega a `/m/[slug]/new`.
2. La página server carga solo schema.
3. `FormClient` opera en modo `create`.
4. Al enviar:
   - inserta en Supabase
   - intenta recuperar `id`
   - redirige a la ficha creada

## 5. Gestión de módulos

1. `/system/modulos` carga el árbol SSR.
2. `PageClient` muestra `ModulosTree`.
3. `CreateModule` abre modal para alta rápida.
4. `upsertModuloAction` valida `props` y persiste.
5. Tras guardar, se refresca árbol y se puede abrir la ficha del módulo.

## 6. Gestión de roles

1. `/system/rol` lista filas de `rol`.
2. Crear rol: `new/page.tsx` reutiliza `Form`.
3. Editar rol: `/system/rol/[id]` carga rol y módulos por API.
4. El usuario marca permisos por módulo/acción.
5. `PUT /api/roles/[id]` actualiza `rol.perms`.

## 7. Gestión de usuarios

1. `/system/users` lista `users`.
2. `/system/users/new` muestra el form del módulo `users`.
3. Submit a `/api/users/create`.
4. El endpoint:
   - resuelve `role_id`
   - crea usuario en Auth
   - inserta en `public.users`

## 8. Preview y generación PDF

1. Se edita una plantilla en `PdfTemplateForm`.
2. El formulario resuelve `tableCatalog`, relaciones y lookups.
3. Para preview de contexto llama a `/api/pdf/context`.
4. Para preview visual usa `/api/pdf/preview` o `/api/pdf/template-preview`.
5. Para PDF final `/api/pdf/generate`:
   - carga plantilla
   - resuelve contexto
   - renderiza HTML
   - genera PDF por servicio externo o Puppeteer local

## 9. Compute y agregados en formularios

1. El usuario cambia un campo.
2. `Form.tsx` detecta dependencias relevantes.
3. `applyCompute` recalcula fórmulas/agregados.
4. Los agregados llaman a `/api/aggregate`.
5. El valor recalculado se refleja antes del submit.
