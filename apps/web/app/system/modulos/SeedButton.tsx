"use client";

import { useTransition, useState } from "react";
import { seedModulosAction } from "@/actions/seed-modulos";
import { useRouter } from "next/navigation";
import styles from "./modulos.module.css";

export default function SeedButton() {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [ok, setOk] = useState<boolean | null>(null);
  const router = useRouter();

  const onClick = () => {
    startTransition(async () => {
      setMsg(null);
      setOk(null);
      const res = await seedModulosAction();
      setOk(res.ok);
      setMsg(res.detail);
      if (res.ok) router.refresh(); // vuelve a cargar el árbol SSR
    });
  };

  return (
    <div className={styles.seedWrap}>
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className={styles.seedBtn}
      >
        {pending ? "Sembrando..." : "Sembrar/Actualizar módulos"}
      </button>
      {msg && (
        <p className={ok ? styles.msgOk : styles.msgErr}>
          {msg}
        </p>
      )}
    </div>
  );
}
