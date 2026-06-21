import { mergeAttributes, Node } from "@tiptap/core";

export type NoteCalloutKind = "info" | "warning" | "success" | "danger";

export type NoteCalloutAttributes = {
  kind?: NoteCalloutKind;
};

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    callout: {
      setCallout: (attributes?: NoteCalloutAttributes) => ReturnType;
      toggleCallout: (attributes?: NoteCalloutAttributes) => ReturnType;
      unsetCallout: () => ReturnType;
    };
  }
}

export const NoteCallout = Node.create({
  name: "callout",

  group: "block",

  content: "block+",

  defining: true,

  addAttributes() {
    return {
      kind: {
        default: "info",
        parseHTML: (element) => element.getAttribute("data-callout-kind") || "info",
        renderHTML: (attributes) => ({
          "data-callout-kind": attributes.kind || "info",
        }),
      },
    };
  },

  parseHTML() {
    return [
      { tag: "aside[data-note-callout]" },
      { tag: "div[data-note-callout]" },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "aside",
      mergeAttributes(HTMLAttributes, {
        "data-note-callout": "true",
        class: "note-callout",
      }),
      0,
    ];
  },

  addCommands() {
    return {
      setCallout:
        (attributes) =>
        ({ commands }) =>
          commands.wrapIn(this.name, attributes),
      toggleCallout:
        (attributes) =>
        ({ commands }) =>
          commands.toggleWrap(this.name, attributes),
      unsetCallout:
        () =>
        ({ commands }) =>
          commands.lift(this.name),
    };
  },
});
