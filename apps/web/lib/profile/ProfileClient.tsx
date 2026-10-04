"use client";

import { useEffect, useState, type FormEvent } from "react";

type Profile = { name: string; surname: string; email: string; emailStatus: string | null; pendingEmail: string | null };
export default function ProfileClient() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [name, setName] = useState(""), [surname, setSurname] = useState(""), [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(true);
  const [error, setError] = useState(""), [message, setMessage] = useState("");
  const [notice, setNotice] = useState(false);

  async function load(signal?: AbortSignal) {
    const response = await fetch("/api/profile", { cache: "no-store", signal });
    const body = await response.json();
    if (!response.ok) throw Error(body.error?.message || "No se pudo cargar el perfil");
    const data = body as Profile;
    setProfile(data); setName(data.name); setSurname(data.surname); setEmail(data.email);
  }
  useEffect(() => {
    const controller = new AbortController();
    const confirmation = new URLSearchParams(window.location.search).get("emailConfirmation");
    if (confirmation) {
      setNotice(true);
      setMessage(confirmation === "error" ? "El enlace no se pudo validar. Abre el último enlace en el navegador donde solicitaste el cambio y comprueba la confirmación." : "Comprueba la confirmación para terminar de guardar tu email.");
    }
    void load(controller.signal).catch(err => {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "No se pudo cargar el perfil");
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>, action: string) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/profile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...values }) });
      const result = await response.json();
      if (!response.ok) throw Error(result.error?.message || "No se pudo guardar el cambio");
      const pending = result.status === "pending_confirmation";
      setNotice(pending || result.status === "unchanged");
      setMessage(pending ? "Cambio pendiente: confirma los enlaces enviados por email y pulsa «Comprobar confirmación». Todavía no se ha completado el cambio." :
        result.status === "unchanged" ? "No hay cambios pendientes." : action === "password" ? "Contraseña actualizada." : action === "details" ? "Nombre y apellidos guardados." : "Email actualizado y verificado en ambas fuentes.");
      if (action === "password") form.reset();
      await load();
    } catch (err) {
      setMessage("");
      setError(err instanceof Error ? err.message : "No se pudo guardar el cambio");
      // Reload the durable state even after a failure; never display a stale success.
      await load().catch(() => undefined);
    } finally { setBusy(false); }
  }
  if (loading) return <div className="p-4" role="status">Cargando perfil…</div>;
  if (!profile) return <div className="p-4"><p role="alert">{error}</p><button className="btn btn-outline-secondary" onClick={() => window.location.reload()}>Reintentar</button></div>;
  const pending = profile.emailStatus === "pending_confirmation";
  const blocked = !!profile.emailStatus;
  return <main className="container py-4" style={{ maxWidth: 760 }} aria-busy={busy}>
    <h1 className="h4 mb-4"><i className="bi bi-person-circle me-2" aria-hidden="true" />Mi perfil</h1>
    {error && <div className="alert alert-danger" role="alert">{error}</div>}
    {message && <div className={`alert ${notice ? "alert-info" : "alert-success"}`} role="status">{message}</div>}
    <form className="card p-4 mb-3" onSubmit={event => void submit(event, "details")}>
      <h2 className="h6 mb-3 text-white">Datos personales</h2>
      
        <fieldset disabled={busy}>
          <label className="form-label text-white" htmlFor="profile-name">Nombre</label>
          <input id="profile-name" className="form-control mb-3" name="name" value={name} onChange={e => setName(e.target.value)} required maxLength={100} autoComplete="given-name" />
          <label className="form-label text-white" htmlFor="profile-surname">Apellidos</label>
          <input id="profile-surname" className="form-control mb-3" name="surname" value={surname} onChange={e => setSurname(e.target.value)} required maxLength={150} autoComplete="family-name" />
          <button className="btn btn-primary" type="submit">Guardar datos personales</button>
        </fieldset>
      
    </form>
    <section className="card p-4 mb-3" aria-labelledby="profile-email-heading">
      <h2 className="h6 mb-3 text-white" id="profile-email-heading">Email</h2>
      {pending ? <>
        <p role="status">Pendiente de confirmación: <strong>{profile.pendingEmail}</strong>. Confirma los correos recibidos y termina el cambio aquí.</p>
        <form onSubmit={event => void submit(event, "finishEmail")}><button type="submit" disabled={busy} className="btn btn-primary">Comprobar confirmación</button></form>
      </> : blocked ? <p className="text-danger" role="alert">Hay un cambio en curso o pendiente de reconciliación técnica. No se ha confirmado el cambio de email. Contacta con administración si persiste.</p> :
        <form onSubmit={event => void submit(event, "email")}><fieldset disabled={busy}>
          <label className="form-label" htmlFor="profile-email">Email de acceso</label>
          <input className="form-control mb-3" id="profile-email" type="email" name="email" value={email} onChange={e => setEmail(e.target.value)} required maxLength={254} autoComplete="email" />
          <p className="small text-white">Supabase puede pedir confirmación en tu email actual y en el nuevo.</p>
          <button type="submit" className="btn btn-primary">Cambiar email</button>
        </fieldset></form>}
    </section>
    <form className="card p-4" onSubmit={event => void submit(event, "password")}>
      <h2 className="h6 mb-3 text-white">Contraseña</h2>
      <fieldset disabled={busy || blocked}>
        <input type="hidden" autoComplete="username" value={profile.email} readOnly />
        <label className="form-label" htmlFor="profile-current-password">Contraseña actual</label>
        <input className="form-control mb-3" id="profile-current-password" name="currentPassword" type="password" required maxLength={1024} autoComplete="current-password" />
        <label className="form-label" htmlFor="profile-password">Nueva contraseña (mínimo 12 caracteres)</label>
        <input className="form-control mb-3" id="profile-password" name="password" type="password" required minLength={12} maxLength={128} autoComplete="new-password" />
        <label className="form-label" htmlFor="profile-confirm-password">Repetir nueva contraseña</label>
        <input className="form-control mb-3" id="profile-confirm-password" name="confirmPassword" type="password" required minLength={12} maxLength={128} autoComplete="new-password" />
        <button type="submit" className="btn btn-primary">Cambiar contraseña</button>
      </fieldset>
    </form>
    {busy && <p className="mt-3" role="status">Procesando…</p>}
  </main>;
}
