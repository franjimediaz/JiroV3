-- Ejecutar manualmente solo si web_site_settings no existe.
-- La aplicación accede desde servidor mediante supabaseAdmin y exige systemadmin.
-- No se crean políticas ni se conceden permisos públicos.
create table public.web_site_settings (
  id integer primary key default 1 check (id = 1),
  header jsonb null check (header is null or jsonb_typeof(header) = 'object'),
  updated_at timestamptz not null default now()
);
alter table public.web_site_settings enable row level security;
-- No se inserta un Header por defecto; se crea el registro id=1 al guardar.
