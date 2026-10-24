"use client";

import { useId, useState, type ComponentProps } from "react";
import { DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, useSortable, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Field } from "@repo/types";
import { FieldRow } from "./FieldRow";
import { createFieldIdentity } from "./fieldOrder";
import styles from "./modulo-detalle.module.css";

type RowProps = ComponentProps<typeof FieldRow>;
type Props = {
  fields: Field[];
  rowProps: Omit<RowProps, "field" | "onChange" | "onRemove" | "onDuplicate" | "dragHandle">;
  onChange: (field: Field, patch: Field) => void;
  onRemove: (field: Field) => void;
  onDuplicate: (field: Field) => void;
  onReorder: (active: Field, over: Field) => void;
};

export function SortableFieldList({ fields, rowProps, onChange, onRemove, onDuplicate, onReorder }: Props) {
  const contextId = useId();
  const [identify] = useState(createFieldIdentity);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = fields.map(identify);
  return <DndContext id={contextId} sensors={sensors} collisionDetection={closestCenter}
    accessibility={{ screenReaderInstructions: { draggable: "Pulsa espacio para mover el campo, flechas para cambiar de posición, espacio para soltar y Escape para cancelar." } }}
    onDragEnd={({ active, over }) => {
      if (rowProps.readOnly || !over || active.id === over.id) return;
      const source = fields[ids.indexOf(String(active.id))], target = fields[ids.indexOf(String(over.id))];
      if (source && target) onReorder(source, target);
    }}>
    <SortableContext items={ids} strategy={verticalListSortingStrategy}>
      <div className="d-flex flex-column gap-2">
        {fields.map(field => <SortableRow key={identify(field)} id={identify(field)} {...rowProps}
          field={field} onChange={patch => onChange(field, patch)} onRemove={() => onRemove(field)} onDuplicate={() => onDuplicate(field)} />)}
      </div>
    </SortableContext>
  </DndContext>;
}

function SortableRow({ id, ...props }: RowProps & { id: string }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging, isOver } = useSortable({ id, disabled: props.readOnly });
  return <div ref={setNodeRef} className={`${styles.sortableField} ${isDragging ? styles.draggingField : ""} ${isOver && !isDragging ? styles.dropTarget : ""}`}
    style={{ transform: CSS.Transform.toString(transform), transition, position: "relative", zIndex: isDragging ? 2 : undefined }}>
    <FieldRow {...props} dragHandle={<button type="button" ref={setActivatorNodeRef} {...attributes} {...listeners}
      className={styles.dragHandle} disabled={props.readOnly} aria-label={`Mover ${props.field.label || props.field.name}`} title="Arrastrar para ordenar">
      <i className="bi bi-grip-vertical" aria-hidden="true" />
    </button>} />
  </div>;
}
