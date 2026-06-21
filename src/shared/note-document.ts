import type { AnyExtension, JSONContent } from "@tiptap/core";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { Table } from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import StarterKit from "@tiptap/starter-kit";
import { NoteCallout } from "@/shared/note-callout-extension";

export type NoteDocumentDto = JSONContent;

export const emptyNoteDocument: NoteDocumentDto = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

function createBaseNoteExtensions() {
  const extensions: AnyExtension[] = [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      link: {
        autolink: true,
        defaultProtocol: "https",
        HTMLAttributes: {
          rel: "noreferrer noopener",
          target: "_blank",
        },
        openOnClick: false,
      },
      underline: {},
    }),
    Image.configure({
      allowBase64: false,
      HTMLAttributes: {
        class: "note-image",
      },
    }),
    Table.configure({
      HTMLAttributes: {
        class: "note-table",
      },
      lastColumnResizable: false,
      resizable: false,
    }),
    TableRow,
    TableHeader,
    TableCell,
    NoteCallout,
    TaskList,
    TaskItem.configure({ nested: false }),
  ];

  return extensions;
}

export function createNoteEditorExtensions(options?: { placeholder?: string }) {
  const extensions = createBaseNoteExtensions();

  if (options?.placeholder) {
    extensions.push(
      Placeholder.configure({
        placeholder: options.placeholder,
      }),
    );
  }

  return extensions;
}

export function createNoteRenderExtensions() {
  return createBaseNoteExtensions();
}
