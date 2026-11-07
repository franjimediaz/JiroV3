"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import styles from "./login.module.css";

function Brand({ light = false }: { light?: boolean }) {
  return (
    <div className={`${styles.brand} ${light ? styles.brandLight : ""}`} aria-label="JiRo">
      <span className={styles.brandMark} aria-hidden="true"><span /></span>
      <span className={styles.brandName}>JiRo</span>
    </div>
  );
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = supabaseBrowser();

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage("");
    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setErrorMessage("No hemos podido iniciar sesión. Revisa tus credenciales e inténtalo de nuevo.");
        return;
      }

      router.replace("/");
    } catch {
      setErrorMessage("No hemos podido conectar con el servicio. Inténtalo de nuevo en unos instantes.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className={styles.page}>
      <section className={styles.visualPanel} aria-label="Presentación de JiRo">
        <div className={styles.visualGlow} aria-hidden="true" />
        <div className={styles.visualGrid} aria-hidden="true" />
        <div className={styles.orbitOne} aria-hidden="true" />
        <div className={styles.orbitTwo} aria-hidden="true" />

        <div className={styles.visualContent}>
          <Brand light />
          <div className={styles.messageBlock}>
            <span className={styles.eyebrow}>Plataforma de gestión</span>
            <h2>Gestión empresarial, flexible y a tu medida</h2>
            <p>Todo lo que necesitas para organizar tu negocio en un único espacio de trabajo.</p>
          </div>
          <p className={styles.visualFooter}>Tu empresa. Tus procesos. Una sola plataforma.</p>
        </div>
      </section>

      <section className={styles.authPanel}>
        <div className={styles.authContainer}>
          <div className={styles.mobileBrand}><Brand /></div>

          <header className={styles.header}>
            <span className={styles.welcome}>Bienvenido de nuevo</span>
            <h1>Iniciar sesión</h1>
            <p>Accede a tu espacio de trabajo</p>
          </header>

          <form onSubmit={onSubmit} className={styles.form}>
            {errorMessage && (
              <div className={styles.error} role="alert" aria-live="assertive">
                <i className="bi bi-exclamation-circle" aria-hidden="true" />
                <span>{errorMessage}</span>
              </div>
            )}

            <div className={styles.field}>
              <label htmlFor="login-email">Correo electrónico</label>
              <div className={styles.inputWrap}>
                <i className="bi bi-envelope" aria-hidden="true" />
                <input
                  id="login-email"
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="nombre@empresa.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  disabled={loading}
                  required
                  autoFocus
                />
              </div>
            </div>

            <div className={styles.field}>
              <label htmlFor="login-password">Contraseña</label>
              <div className={styles.inputWrap}>
                <i className="bi bi-lock" aria-hidden="true" />
                <input
                  id="login-password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Introduce tu contraseña"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={loading}
                  required
                />
                <button
                  type="button"
                  className={styles.passwordToggle}
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                  aria-pressed={showPassword}
                  disabled={loading}
                >
                  <i className={`bi ${showPassword ? "bi-eye-slash" : "bi-eye"}`} aria-hidden="true" />
                </button>
              </div>
            </div>

            <button type="submit" className={styles.submit} disabled={loading || !email || !password}>
              {loading ? (
                <><span className={styles.spinner} aria-hidden="true" />Iniciando sesión…</>
              ) : (
                <>Acceder <i className="bi bi-arrow-right" aria-hidden="true" /></>
              )}
            </button>
          </form>

          <p className={styles.support}>Acceso seguro a la plataforma JiRo</p>
        </div>
      </section>
    </main>
  );
}
