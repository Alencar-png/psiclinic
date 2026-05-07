"use client";

import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { useEffect } from "react";

interface Props {
  value: string;
  onChange: (html: string, plain: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

/**
 * Editor TipTap minimalista. Emite HTML + texto plano em cada change.
 * O parent decide quando persistir (debounce de auto-save).
 */
export function RichTextEditor({ value, onChange, disabled, placeholder }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: placeholder ?? "Anote a sessão. As observações são criptografadas em repouso.",
      }),
    ],
    content: value,
    editable: !disabled,
    immediatelyRender: false,
    onUpdate({ editor }) {
      onChange(editor.getHTML(), editor.getText());
    },
  });

  // Sincroniza quando value muda externamente (ex: rollback)
  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value, false);
    }
  }, [value, editor]);

  if (!editor) return <div className="tiptap text-stone-400">Carregando editor…</div>;

  const btn = (active: boolean) =>
    `rounded-md px-2 py-1 text-sm ${active ? "bg-primary-50 text-primary-900" : "text-stone-600 hover:bg-stone-100"}`;

  return (
    <div className="rounded-xl border border-border bg-white">
      <div className="flex flex-wrap items-center gap-1 border-b border-border px-2 py-1.5">
        <button type="button" onClick={() => editor.chain().focus().toggleBold().run()}
          className={btn(editor.isActive("bold"))}>B</button>
        <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()}
          className={`italic ${btn(editor.isActive("italic"))}`}>I</button>
        <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={btn(editor.isActive("bulletList"))}>•</button>
        <button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={btn(editor.isActive("orderedList"))}>1.</button>
        <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          className={btn(editor.isActive("heading", { level: 3 }))}>H3</button>
        <button type="button" onClick={() => editor.chain().focus().toggleBlockquote().run()}
          className={btn(editor.isActive("blockquote"))}>“ ”</button>
      </div>
      <EditorContent editor={editor} className="tiptap" />
    </div>
  );
}
