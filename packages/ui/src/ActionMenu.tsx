"use client";

import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import type {ActionMenuItem,ActionMenuProps } from "@repo/types";


/* ──────────────────────────────────────────────
   Componente
────────────────────────────────────────────── */

export function ActionMenu({
  items = [],
  align = "end",
  size = "sm",
  disabled = false,
  ariaLabel = "Acciones",
}: ActionMenuProps) {
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => setMounted(true), []);

  const visibleItems = useMemo(() => {
  return (items || [])
    .filter((i): i is ActionMenuItem => Boolean(i))
    .filter((i) => !i.hidden);
}, [items]);

  const computePos = () => {
    const btn = btnRef.current;
    if (!btn) return;

    const r = btn.getBoundingClientRect();
    const gap = 8;
    const menuWidth = 220;

    let left =
      align === "start"
        ? r.left
        : r.right - menuWidth;

    left = clamp(left, 8, window.innerWidth - menuWidth - 8);

    let top = r.bottom + gap;

    const approxHeight = Math.min(visibleItems.length, 6) * 40 + 16;
    if (top + approxHeight > window.innerHeight - 8) {
      top = Math.max(8, r.top - gap - approxHeight);
    }

    setPos({ top, left });
  };

  useLayoutEffect(() => {
    if (open) computePos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, align, visibleItems.length]);

  useEffect(() => {
    if (!open) return;

    const onResize = () => computePos();
    const onScroll = () => computePos();

    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll, true);

    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };

    const onPointerDown = (e: PointerEvent) => {
      if (
        btnRef.current?.contains(e.target as Node) ||
        menuRef.current?.contains(e.target as Node)
      )
        return;
      setOpen(false);
    };

    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown);

    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  const toggle = () => {
    if (!disabled) setOpen((v) => !v);
  };

  const handleItemClick = async (item: ActionMenuItem) => {
    if (item.disabled) return;
    try {
      await item.onClick?.();
    } finally {
      setOpen(false);
    }
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={`am-btn am-btn-${size}`}
        onClick={toggle}
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
      >
        <span className="am-dots" aria-hidden>
          ⋮
        </span>
      </button>

      {mounted &&
        open &&
        createPortal(
          <div
            ref={menuRef}
            className="am-menu"
            role="menu"
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              width: 220,
              zIndex: 10000,
            }}
          >
            {visibleItems.length === 0 ? (
              <div className="am-empty">Sin acciones</div>
            ) : (
              visibleItems.map((item, idx) => (
                <button
                  key={idx}
                  type="button"
                  role="menuitem"
                  className={`am-item ${
                    item.variant ? `am-${item.variant}` : ""
                  }`}
                  onClick={() => handleItemClick(item)}
                  disabled={item.disabled}
                  title={item.title}
                >
                  <span className="am-icon">{item.icon}</span>
                  <span className="am-label">{item.label}</span>
                </button>
              ))
            )}
          </div>,
          document.body
        )}
    </>
  );
}

/* ──────────────────────────────────────────────
   Utils
────────────────────────────────────────────── */

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}
