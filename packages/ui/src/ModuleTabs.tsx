"use client";

type Props = {
  items: Array<{ id: string; label: string }>;
  activeId?: string | null;
  onChange: (id: string) => void;
  label: string;
};

/** Shared horizontal navigation for form views and reverse relations. */
export function ModuleTabs({ items, activeId, onChange, label }: Props) {
  return (
    <div className="card-header pb-0 jiro-module-tabs">
      <ul className="nav nav-tabs card-header-tabs" aria-label={label}>
        {items.map(item => (
          <li className="nav-item" key={item.id}>
            <button
              type="button"
              className={`nav-link jiro-relation-button ${activeId === item.id ? "active" : ""}`}
              aria-pressed={activeId === item.id}
              onClick={() => onChange(item.id)}
            >
              {item.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
