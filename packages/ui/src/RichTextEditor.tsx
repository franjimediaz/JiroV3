"use client";

import React, { useEffect, useMemo, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import TextAlign from "@tiptap/extension-text-align";
import {Table} from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import Highlight from "@tiptap/extension-highlight";
import {TextStyle} from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";

function Btn({
  active,
  disabled,
  onClick,
  children,
  title,
}: {
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      className={`btn btn-sm ${active ? "btn-primary" : "btn-outline-secondary"}`}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {children}
    </button>
  );
}

export default function RichTextEditor({
  value,
  onChange,
  readOnly,
  placeholder = "Escribe aquí…",
}: {
  value: string;
  onChange: (html: string) => void;
  readOnly?: boolean;
  placeholder?: string;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const extensions = useMemo(
    () => [
      StarterKit,
      Underline,
      Link.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
      }),
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Highlight,
      TextStyle,
      Color,
    ],
    []
  );

  const editor = useEditor({
    extensions,
    content: value || "",
    editable: !readOnly,
    immediatelyRender: false,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        class:
          "prose prose-sm max-w-none focus:outline-none", // si no usas prose/tailwind, lo ignorará
        "data-placeholder": placeholder,
      },
    },
  });

  // Sync externo (cambio de bloque, load, etc.) sin disparar onUpdate
  useEffect(() => {
    if (!editor) return;
    const next = value || "";
    const current = editor.getHTML();
    if (current !== next) editor.commands.setContent(next, { emitUpdate: false });
  }, [value, editor]);

  if (!mounted || !editor) return null;

  const disabled = !!readOnly;

  const setLink = () => {
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("URL del enlace", prev || "");
    if (url === null) return;
    if (!url) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    editor.chain().focus().setLink({ href: url }).run();
  };

  return (
    <div>
      {/* Toolbar */}
      <div className="d-flex flex-wrap gap-2 mb-2">
        {/* Headings */}
        <div className="btn-group" role="group" aria-label="headings">
          <Btn
            disabled={disabled}
            active={editor.isActive("heading", { level: 1 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            title="Título H1"
          >
            H1
          </Btn>
          <Btn
            disabled={disabled}
            active={editor.isActive("heading", { level: 2 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            title="Título H2"
          >
            H2
          </Btn>
          <Btn
            disabled={disabled}
            active={editor.isActive("heading", { level: 3 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            title="Título H3"
          >
            H3
          </Btn>
        </div>

        {/* Marks */}
        <div className="btn-group" role="group" aria-label="marks">
          <Btn disabled={disabled} active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()} title="Negrita">
            <b>B</b>
          </Btn>
          <Btn disabled={disabled} active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()} title="Cursiva">
            <i>I</i>
          </Btn>
          <Btn disabled={disabled} active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()} title="Subrayado">
            <u>U</u>
          </Btn>
          <Btn disabled={disabled} active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()} title="Tachado">
            <s>S</s>
          </Btn>
          <Btn disabled={disabled} active={editor.isActive("highlight")} onClick={() => editor.chain().focus().toggleHighlight().run()} title="Resaltado">
            ✦
          </Btn>
        </div>

        {/* Lists & blocks */}
        <div className="btn-group" role="group" aria-label="lists-blocks">
          <Btn
            disabled={disabled}
            active={editor.isActive("bulletList")}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            title="Lista"
          >
            • List
          </Btn>
          <Btn
            disabled={disabled}
            active={editor.isActive("orderedList")}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            title="Lista numerada"
          >
            1. List
          </Btn>
          <Btn
            disabled={disabled}
            active={editor.isActive("blockquote")}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            title="Cita"
          >
            “ ”
          </Btn>
          <Btn
            disabled={disabled}
            active={editor.isActive("codeBlock")}
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            title="Bloque de código"
          >
            {"</>"}
          </Btn>
        </div>

        {/* Align */}
        <div className="btn-group" role="group" aria-label="align">
          <Btn disabled={disabled} active={editor.isActive({ textAlign: "left" })} onClick={() => editor.chain().focus().setTextAlign("left").run()} title="Izquierda">
            ⬅
          </Btn>
          <Btn disabled={disabled} active={editor.isActive({ textAlign: "center" })} onClick={() => editor.chain().focus().setTextAlign("center").run()} title="Centrado">
            ↔
          </Btn>
          <Btn disabled={disabled} active={editor.isActive({ textAlign: "right" })} onClick={() => editor.chain().focus().setTextAlign("right").run()} title="Derecha">
            ➡
          </Btn>
        </div>

        {/* Link */}
        <div className="btn-group" role="group" aria-label="link">
          <Btn disabled={disabled} active={editor.isActive("link")} onClick={setLink} title="Enlace">
            🔗
          </Btn>
          <Btn disabled={disabled} onClick={() => editor.chain().focus().unsetLink().run()} title="Quitar enlace">
            ✕🔗
          </Btn>
        </div>

        {/* Table */}
        <div className="btn-group" role="group" aria-label="table">
          <Btn
            disabled={disabled}
            onClick={() =>
              editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
            }
            title="Insertar tabla"
          >
            ▦+
          </Btn>
          <Btn disabled={disabled} onClick={() => editor.chain().focus().addRowAfter().run()} title="Fila +">
            +Fila
          </Btn>
          <Btn disabled={disabled} onClick={() => editor.chain().focus().addColumnAfter().run()} title="Columna +">
            +Col
          </Btn>
          <Btn disabled={disabled} onClick={() => editor.chain().focus().deleteTable().run()} title="Borrar tabla">
            ▦✕
          </Btn>
        </div>

        {/* Undo/redo */}
        <div className="btn-group" role="group" aria-label="history">
          <Btn disabled={disabled} onClick={() => editor.chain().focus().undo().run()} title="Deshacer">
            ↶
          </Btn>
          <Btn disabled={disabled} onClick={() => editor.chain().focus().redo().run()} title="Rehacer">
            ↷
          </Btn>
        </div>

        {/* Color (simple) */}
        <div className="d-flex align-items-center gap-2">
          <label className="small text-muted mb-0">Color</label>
          <input
            type="color"
            disabled={disabled}
            onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
            value={editor.getAttributes("textStyle").color || "#000000"}
            style={{ width: 36, height: 28 }}
          />
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            disabled={disabled}
            onClick={() => editor.chain().focus().unsetColor().run()}
            title="Quitar color"
          >
            ⟲
          </button>
        </div>
      </div>

      {/* Editor */}
      <div className="border rounded p-2" style={{ minHeight: 180 }}>
        <EditorContent editor={editor} />
      </div>

      <div className="form-text mt-2">
        Se guarda como HTML. (Tablas, enlaces, formato…)
      </div>
    </div>
  );
}
