import "server-only";
import { createClient as createAuthClient } from "@supabase/supabase-js";
import { supabaseAdmin as admin } from "@/lib/supabase/admin";
import type { CurrentUserContext } from "@/lib/auth/getCurrentUser";
import { badRequest, conflict } from "@/lib/auth/apiError";
import { finishEmailChange, type EmailOperation } from "./emailSaga";
import type { ProfileInput } from "./validation";

const openStatuses = ["starting", "pending_confirmation", "applying", "reconciliation_required"];
async function snapshot(uid: string) {
  const [auth, db] = await Promise.all([
    admin.auth.admin.getUserById(uid),
    admin.from("users").select("name,surname,email").eq("uid", uid).single(),
  ]);
  if (auth.error || !auth.data.user?.email || db.error || !db.data) throw Error("profile_read_failed");
  return { auth: auth.data.user.email, database: db.data.email as string | null,
    pending: auth.data.user.new_email || undefined, name: db.data.name as string | null, surname: db.data.surname as string | null };
}
async function openOperation(uid: string) {
  const { data, error } = await admin.from("profile_email_changes").select("id,old_auth_email,old_db_email,new_email,status")
    .eq("user_id", uid).in("status", openStatuses).maybeSingle();
  if (error) throw Error("profile_journal_read_failed");
  return data as (EmailOperation & { status: string }) | null;
}
export async function getProfile(uid: string) {
  const [state, operation] = await Promise.all([snapshot(uid), openOperation(uid)]);
  return { name: state.name || "", surname: state.surname || "", email: state.auth,
    emailStatus: operation?.status || (state.auth !== state.database || state.pending ? "reconciliation_required" : null),
    pendingEmail: operation?.new_email || null };
}
async function close(uid: string, id: string, status: string, reason?: string) {
  const { data, error } = await admin.from("profile_email_changes").update({ status, reason: reason || null, updated_at: new Date().toISOString() })
    .eq("id", id).eq("user_id", uid).select("id").single();
  if (error || !data) throw Error("profile_journal_write_failed");
}
async function finish(uid: string) {
  const op = await openOperation(uid);
  if (!op) {
    const state = await snapshot(uid);
    if (state.auth !== state.database || state.pending) throw conflict("El email requiere revisión técnica");
    return { status: "unchanged" };
  }
  if (op.status !== "pending_confirmation") throw conflict("Hay un cambio de email en curso o pendiente de revisión técnica");
  const state = await snapshot(uid);
  if (state.auth === op.old_auth_email && state.database === op.old_db_email) return { status: "pending_confirmation" };
  const { data, error } = await admin.from("profile_email_changes").update({ status: "applying", updated_at: new Date().toISOString() })
    .eq("id", op.id).eq("user_id", uid).eq("status", "pending_confirmation").select("id").maybeSingle();
  if (error || !data) throw conflict("El cambio ya está siendo procesado");
  try {
    await finishEmailChange(op, {
      read: () => snapshot(uid),
      writeDatabase: async (previous, next) => {
        const query = admin.from("users").update({ email: next }).eq("uid", uid);
        const result = await (previous === null ? query.is("email", null) : query.eq("email", previous)).select("uid").single();
        if (result.error || !result.data) throw Error("profile_email_database_write_failed");
      },
      restoreAuth: async email => {
        const result = await admin.auth.admin.updateUserById(uid, { email });
        if (result.error) throw Error("profile_email_auth_rollback_failed");
      },
      close: (status, reason) => close(uid, op.id, status, reason),
      log: reason => console.error("profile_email_reconciliation", { userId: uid, operationId: op.id, reason }),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "PROFILE_EMAIL_ROLLED_BACK") throw conflict("No se pudo guardar el email. Se ha restaurado el email anterior; vuelve a iniciar sesión si fuera necesario.");
    throw conflict("No se pudo confirmar el cambio. El caso queda registrado para reconciliación técnica.");
  }
  return { status: "completed" };
}

export async function updateProfile(ctx: CurrentUserContext, input: ProfileInput, origin: string) {
  const uid = ctx.user.id;
  if (input.action === "finishEmail") return finish(uid);
  if (input.action === "details") {
    const { data, error } = await admin.from("users").update({ name: input.name, surname: input.surname })
      .eq("uid", uid).select("name,surname").single();
    if (error || !data || data.name !== input.name || data.surname !== input.surname) throw Error("profile_details_update_failed");
    return { status: "completed" };
  }
  const state = await snapshot(uid);
  if (await openOperation(uid)) throw conflict("Completa el cambio de email pendiente antes de cambiar las credenciales");
  if (input.action === "password") {
    if (state.auth !== state.database || state.pending) throw conflict("El email requiere revisión antes de cambiar la contraseña");
    // Dedicated short-lived session: never replace the browser's session or use admin to bypass Auth policies.
    const auth = createAuthClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    try {
      const login = await auth.auth.signInWithPassword({ email: state.auth, password: input.currentPassword });
      if (login.error || login.data.user?.id !== uid) throw badRequest("No se pudo verificar la contraseña actual");
      const result = await auth.auth.updateUser({ password: input.password });
      if (result.error || result.data.user?.id !== uid) throw badRequest("No se pudo cambiar la contraseña. Comprueba la política de seguridad de tu cuenta.");
      return { status: "completed" };
    } finally { await auth.auth.signOut({ scope: "local" }).catch(() => undefined); }
  }
  if (state.auth === input.email && state.database === input.email && !state.pending) return { status: "unchanged" };
  const inconsistent = state.auth !== state.database || !!state.pending;
  const { data: op, error } = await admin.from("profile_email_changes").insert({ user_id: uid,
    old_auth_email: state.auth, old_db_email: state.database, new_email: input.email,
    status: inconsistent ? "reconciliation_required" : "starting", reason: inconsistent ? "preexisting_mismatch" : null,
  }).select("id").single();
  if (error || !op) throw conflict("No se pudo iniciar el cambio de email; puede haber otro cambio pendiente");
  if (inconsistent) {
    console.error("profile_email_reconciliation", { userId: uid, operationId: op.id, reason: "preexisting_mismatch" });
    throw conflict("El email actual no coincide entre las fuentes. Se ha registrado para revisión técnica.");
  }
  try {
    const fresh = await snapshot(uid);
    if (fresh.auth !== state.auth || fresh.database !== state.database || fresh.pending) throw Error("concurrent_change");
    const result = await ctx.supabase.auth.updateUser({ email: input.email }, { emailRedirectTo: `${origin}/auth/profile-callback` });
    if (result.error) throw Error("auth_email_update_failed");
    await close(uid, op.id, "pending_confirmation");
  } catch {
    // Never assume a failed HTTP request means Auth did not commit.
    let status = "reconciliation_required";
    try {
      const current = await snapshot(uid);
      if (current.auth === state.auth && current.database === state.database && !current.pending) status = "rolled_back";
    } catch { /* retain durable unresolved marker */ }
    console.error("profile_email_request_failed", { userId: uid, operationId: op.id, status });
    try { await close(uid, op.id, status, "auth_request_or_journal_failed"); } catch { /* starting remains open */ }
    throw conflict(status === "rolled_back" ? "No se pudo solicitar el cambio de email. No se ha confirmado ningún cambio." : "No se pudo confirmar la solicitud; queda registrada para revisión técnica.");
  }
  // Handles both confirmation-enabled projects and projects where Auth changes immediately.
  return finish(uid);
}
