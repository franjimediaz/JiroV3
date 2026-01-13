"use client";

import React, { useMemo } from "react";
import { PopupSelector } from "./PopUpSelector";

export type TableField = {
  name: string;
  label?: string;
};

export function FieldPickerModal({
  open,
  title,
  multiple,
  value,
  fields,
  loading,
  onClose,
  onApply,
}: {
  open: boolean;
  title?: string;
  multiple?: boolean;
  value: any;
  fields: TableField[];
  loading?: boolean;
  onClose: () => void;
  onApply: (nextValue: any) => void;
}) {
  // 🔑 Aquí está la clave: value=name, label=label
  const items = useMemo(
    () =>
      (fields || []).map((f) => ({
        value: f.name,
        label: f.label || f.name,
      })),
    [fields]
  );

  return (
    <PopupSelector
      open={open}
      title={title || "Seleccionar campos"}
      multiple={multiple}
      value={value}
      items={items}
      loading={loading}
      onClose={onClose}
      onApply={onApply}
    />
  );
}

