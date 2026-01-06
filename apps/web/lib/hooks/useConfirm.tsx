"use client";

import { useState } from "react";
import { ModalConfirm} from "@repo/ui";

type ConfirmOptions = {
  title?: string;
  message?: string;
  details?: { label: string; value: any }[];
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  mode?: "confirm" | "info";
};

export function useConfirm() {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const [resolver, setResolver] = useState<
    ((value: boolean) => void) | null
  >(null);

  const confirm = (opts: ConfirmOptions) =>
    new Promise<boolean>((resolve) => {
      setOptions(opts);
      setResolver(() => resolve);
    });

  const handleConfirm = () => {
    resolver?.(true);
    cleanup();
  };

  const handleCancel = () => {
    resolver?.(false);
    cleanup();
  };

  const cleanup = () => {
    setOptions(null);
    setResolver(null);
  };
  const inform = (opts: ConfirmOptions) =>
  new Promise<void>((resolve) => {
    setOptions({
      ...opts,
      mode: "info",
      confirmText: opts.confirmText ?? "Aceptar",
      cancelText: undefined,
      danger: false,
    });
    setResolver(() => () => resolve());
  });


  const modal = options ? (
    <ModalConfirm
      open
      {...options}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  ) : null;

  return { confirm, modal, inform };
}
