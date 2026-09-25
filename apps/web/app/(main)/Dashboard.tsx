import Link from "next/link";
import type { CSSProperties } from "react";
import type { DashboardModule } from "./dashboard-model";
import styles from "./dashboard.module.css";

function Icon({ name }: { name: string }) {
  return <i className={name} aria-hidden="true" />;
}

function ModuleLink({
  item,
  metric = false,
}: {
  item: DashboardModule;
  metric?: boolean;
}) {
  const content = (
    <>
      <span
        className={styles.moduleIcon}
        style={{ "--module-color": item.color } as CSSProperties}
      >
        <Icon name={item.icon} />
      </span>
      <span className={styles.moduleContent}>
        <span className={styles.moduleName}>{item.name}</span>
        {metric ? (
          <span className={styles.count}>
            {item.count === null ? (
              "Conteo no disponible"
            ) : (
              <>
                <strong>
                  {new Intl.NumberFormat("es-ES").format(item.count)}
                </strong>{" "}
                registros accesibles
              </>
            )}
          </span>
        ) : (
          <span className={styles.hint}>
            {item.href ? "Abrir módulo" : "Acceso no disponible"}
          </span>
        )}
      </span>
      {item.href && <Icon name="bi bi-arrow-up-right" />}
    </>
  );
  return item.href ? (
    <Link href={item.href} className={styles.moduleLink} prefetch={false}>
      {content}
    </Link>
  ) : (
    <div
      className={`${styles.moduleLink} ${styles.unavailable}`}
      aria-disabled="true"
    >
      {content}
    </div>
  );
}

export function Dashboard({
  modules,
  featured,
  email,
  loadError,
}: {
  modules: DashboardModule[];
  featured: DashboardModule[];
  email: string;
  loadError: boolean;
}) {
  const business = modules.filter((item) => !item.system);
  const system = modules.filter((item) => item.system);
  const first = featured[0];
  return (
    <div className={styles.dashboard}>
      <header className={styles.hero}>
        <div className={styles.heroBody}>
          <span className={styles.eyebrow}>JIRO · INICIO</span>
          <h1>Todo el proyecto en una portada.</h1>
          <p>Accede a tus módulos y continúa con el trabajo de hoy.</p>
          {first?.href && (
            <Link
              className={styles.primaryAction}
              href={first.href}
              prefetch={false}
            >
              <Icon name="bi bi-arrow-right" />
              <span>Abrir {first.name}</span>
            </Link>
          )}
        </div>
        <div className={styles.account}>
          <span className={styles.accountIcon}>
            <Icon name="bi bi-person-circle" />
          </span>
          <div>
            <span className={styles.eyebrow}>Tu cuenta</span>
            <p className={styles.email}>{email}</p>
          </div>
          <form action="/api/auth/signout" method="post">
            <button type="submit" className={styles.signout}>
              <Icon name="bi bi-box-arrow-right" /> Cerrar sesión
            </button>
          </form>
        </div>
      </header>
      {loadError ? (
        <section className={styles.empty} role="alert">
          <Icon name="bi bi-exclamation-triangle" />
          <h2>No se pudieron cargar los módulos</h2>
          <p>Vuelve a intentar cargar el inicio en unos instantes.</p>
          <Link href="/" prefetch={false} className={styles.retry}>
            Volver a cargar el inicio
          </Link>
        </section>
      ) : (
        <>
          {featured.length > 0 && (
            <section aria-labelledby="featured-title">
              <div className={styles.sectionHeading}>
                <div>
                  <h2 id="featured-title">Accesos destacados</h2>
                  <p>
                    Tus módulos a mano, con los registros accesibles para tu
                    cuenta.
                  </p>
                </div>
                <span className={styles.badge}>
                  {featured.length} destacados
                </span>
              </div>
              <div className={styles.featuredGrid}>
                {featured.map((item) => (
                  <ModuleLink key={item.id} item={item} metric />
                ))}
              </div>
            </section>
          )}
          <div className={system.length ? styles.columns : styles.singleColumn}>
            <section className={styles.panel} aria-labelledby="business-title">
              <div className={styles.sectionHeading}>
                <div>
                  <h2 id="business-title">Módulos de negocio</h2>
                  <p>Explora las herramientas de tu espacio de trabajo.</p>
                </div>
                <span className={styles.badge}>{business.length}</span>
              </div>
              {business.length ? (
                <div className={styles.moduleGrid}>
                  {business.map((item) => (
                    <ModuleLink key={item.id} item={item} />
                  ))}
                </div>
              ) : (
                <div className={styles.empty}>
                  <Icon name="bi bi-grid-1x2" />
                  <h3>Aún no hay módulos de negocio</h3>
                  <p>
                    Los módulos activos aparecerán aquí cuando estén
                    disponibles.
                  </p>
                </div>
              )}
            </section>
            {system.length > 0 && (
              <section className={styles.panel} aria-labelledby="system-title">
                <div className={styles.sectionHeading}>
                  <div>
                    <h2 id="system-title">Administración</h2>
                    <p>Configuración de tu espacio.</p>
                  </div>
                  <Icon name="bi bi-sliders" />
                </div>
                <div className={styles.systemList}>
                  {system.map((item) => (
                    <ModuleLink key={item.id} item={item} />
                  ))}
                </div>
              </section>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div
      className={styles.dashboard}
      role="status"
      aria-busy="true"
      aria-label="Cargando inicio"
    >
      <span className={styles.loadingLabel}>
        Cargando tu espacio de trabajo…
      </span>
      <div
        className={`${styles.skeleton} ${styles.skeletonHero}`}
        aria-hidden="true"
      />
      <div className={styles.featuredGrid} aria-hidden="true">
        {[0, 1, 2, 3].map((id) => (
          <div key={id} className={styles.skeleton} />
        ))}
      </div>
    </div>
  );
}
