"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { seedModulosAction } from "@/actions/seed-modulos";

import type { ModuloNode } from "@repo/types";
import {ModulosTree} from "@repo/ui"; // ajusta la ruta real en tu monorepo
import {CreateModule} from "@repo/ui"; // ajusta la ruta real en tu monorepo

import { upsertModuloAction } from "@/actions/modulos";

type Tipo = "carpeta" | "tabla" | "subtabla" | "vista";

type OpenCreateModuleFn = (opts: {
  parentId: string | null;
  defaultTipo?: Tipo;
}) => void;




export default function PageClient({
  nodes,
}: {
  nodes: ModuloNode[];
}) {
  const router = useRouter();

  // Control del modal
  const [open, setOpen] = useState(false);
  const [parentId, setParentId] = useState<string | null>(null);
  const [defaultTipo, setDefaultTipo] = useState<Tipo>("tabla");

  const [seeding, startSeeding] = useTransition();
  const [seedMsg, setSeedMsg] = useState<string | null>(null);
  const [seedOk, setSeedOk] = useState<boolean | null>(null);

  const handleSeedModulos = () => {
    const router = useRouter();
    startSeeding(async () => {
      setSeedMsg(null);
      setSeedOk(null);

      const res = await seedModulosAction();
      setSeedOk(res.ok);
      setSeedMsg(res.detail);

      if (res.ok) {
        router.refresh(); // vuelve a cargar el árbol SSR
      }
    });
  };


  const onOpenCreateModule: OpenCreateModuleFn = ({ parentId, defaultTipo }) => {
    setParentId(parentId ?? null);
    setDefaultTipo(defaultTipo ?? "tabla");
    setOpen(true);
  };

  // Acción root (crear módulo raíz)
  const onCreateRoot = () => {
    onOpenCreateModule({ parentId: null, defaultTipo: "carpeta" }); // si prefieres tabla por defecto, cambia aquí
  };

  // Guardado real (app)
  const onSave = async (fd: FormData) => {
    return await upsertModuloAction(fd);
  };

  const onAfterSave = (res: { ok: boolean; id?: string }) => {
    // Igual que antes: refrescar árbol SSR
    router.refresh();

    // Opcional: ir directo al módulo creado
    if (res.id) router.push(`/system/modulos/${res.id}?edit=true`);
  };

  return (
    <div>
   
    
      <div className="d-flex flex-column gap-3">
        {/* Botón nuevo módulo + árbol */}
        <ModulosTree
          nodes={nodes}
          onCreateRoot={onCreateRoot}
          onOpenCreateModule={onOpenCreateModule}
        />

        {/* Modal (UI) */}
        <CreateModule
          open={open}
          onClose={() => setOpen(false)}
          parentId={parentId}
          defaultTipo={defaultTipo}
          onSave={onSave}
          onAfterSave={onAfterSave}
        />
      </div>
    </div>
  
  );
}
