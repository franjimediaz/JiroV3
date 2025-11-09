// /app/system/modulos/[id]/page.tsx
import { isUUID } from "@/lib/utils/isUUID";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import ModuloForm from "./ModuloForm";
import styles from "./modulo-detalle.module.css";

export const dynamic = "force-dynamic";

async function getModuloById(id: string) {
  const { data, error } = await supabaseAdmin
    .from("modulos")
    .select("id,parent_id,nombre,slug,route,tipo,orden,activo,props")
    .eq("id", id)
    .maybeSingle();
  return { data, error: error?.message ?? null };
}

export default async function ModuloUnifiedPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string; parentId?: string }>;
}) {
  // ✅ Desenvuelve las Promises
  const { id } = await props.params;
  const { edit, parentId } = await props.searchParams;

  const isNew = id === "new";
  const isEdit = isNew || edit === "true";

  if (isNew) {
    const initial = {
      id: undefined,
      parent_id: parentId ?? null,
      nombre: "",
      slug: "",
      tipo: "tabla" as const,
      orden: 0,
      activo: true,
      props: { db: { table: "", softDelete: false }, fields: [], ui: {} },
    };
    return (
      <main className={styles.wrap}>
        <header className={styles.header}>
          <div><h1 className={styles.title}>Crear módulo</h1></div>
          <nav className={styles.actions}>
            <a className={styles.btnLight} href="/system/modulos">← Volver</a>
          </nav>
        </header>
        <ModuloForm initialData={initial} mode="create" />
      </main>
    );
  }

  if (!isUUID(id)) {
    return (
      <main className={styles.wrap}>
        <h1 className={styles.title}>ID inválido</h1>
        <p className={styles.msgErr}>El parámetro no es un UUID válido.</p>
        <a className={styles.btnLight} href="/system/modulos">← Volver</a>
      </main>
    );
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return (
      <main className={styles.wrap}>
        <h1 className={styles.title}>No autenticado</h1>
        <a className={styles.btnLight} href="/login">Ir a login</a>
      </main>
    );
  }

  const { data: modulo, error } = await getModuloById(id);
  if (!modulo) {
    return (
      <main className={styles.wrap}>
        <h1 className={styles.title}>Módulo no encontrado</h1>
        {error && <p className={styles.msgErr}>Detalle: {error}</p>}
        <a className={styles.btnLight} href="/system/modulos">← Volver</a>
      </main>
    );
  }

  const mode = isEdit ? "edit" : "view" as const;

  return (
    <main className={styles.wrap}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>{modulo.nombre}</h1>
          <p className={styles.subtitle}>/{modulo.slug} · {modulo.tipo}</p>
        </div>
        <nav className={styles.actions}>
          {!isEdit ? (
            <a className={styles.btn} href={`?edit=true`}>Editar</a>
          ) : (
            <a className={styles.btnSecondary} href={`?edit=false`}>Ver</a>
          )}
          <a className={styles.btnLight} href="/system/modulos">← Volver</a>
        </nav>
      </header>

      <ModuloForm initialData={modulo} mode={mode} />
    </main>
  );
}
