import Link from "next/link";
import type { CSSProperties } from "react";
import type { DashboardModule, DashboardModuleGroup } from "./dashboard-model";
import styles from "./dashboard.module.css";

function Icon({ name }: { name: string }) {
  return <i className={name} aria-hidden="true" />;
}

function ModuleLink({ item }: { item: DashboardModule }) {
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
        
      </span>
      <Icon name="bi bi-arrow-up-right" />
    </>
  );
  return (
    <Link href={item.href} className={styles.moduleLink} prefetch={false}>
      {content}
    </Link>
  );
}

export function Dashboard({
  groups,
  email,
  loadError,
}: {
  groups: DashboardModuleGroup[];
  email: string;
  loadError: boolean;
}) {
  const first = groups[0]?.modules[0];
  return (
    <div className={styles.dashboard}>
      <header className={styles.hero}>
        <div className={styles.heroBody}>
          <span className={styles.eyebrow}>JIRO</span>
          <h1>Todo el proyecto en una portada.</h1>
          <p>Accede a tus módulos y continúa con el trabajo de hoy.</p>
          {first?.href && (
            <Link
              className={styles.primaryAction}
              href="/m/mytask"
              prefetch={false}
            >
              <Icon name="bi bi-arrow-right" />
              <span>Ir a mis tareas</span>
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
      ) : groups.length ? (
        <div className={styles.groupGrid}>
          {groups.map((group) => (
            <section
              key={group.id}
              className={styles.panel}
              aria-labelledby={`group-${group.id}`}
            >
              <div className={styles.sectionHeading}>
                <h2 id={`group-${group.id}`}>{group.name}</h2>
                <span
                  className={styles.badge}
                  aria-label={`${group.modules.length} accesos`}
                >
                  {group.modules.length}
                </span>
              </div>
              <div className={styles.moduleGrid}>
                {group.modules.map((item) => (
                  <ModuleLink key={item.id} item={item} />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <section className={styles.empty}>
          <Icon name="bi bi-grid-1x2" />
          <h2>No tienes accesos configurados para el dashboard.</h2>
          <p>
            Los módulos habilitados aparecerán aquí cuando tengas permiso para
            acceder.
          </p>
        </section>
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
