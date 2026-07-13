import { describe, expect, it } from "vitest";
import {
  buildNoteImageInsertContent,
  createClientUploadId,
  extractClipboardImageFiles,
} from "@/features/notes/note-editor-image";

describe("note editor image helpers", () => {
  it("extracts pasted image files from clipboard items first", () => {
    const file = new File([new Uint8Array([137, 80, 78, 71])], "clipboard.png", {
      type: "image/png",
    });

    const files = extractClipboardImageFiles({
      items: [
        {
          getAsFile: () => file,
          kind: "file",
          type: "image/png",
        },
      ],
    });

    expect(files).toEqual([file]);
  });

  it("falls back to clipboard files when items do not expose images", () => {
    const image = new File([new Uint8Array([137, 80, 78, 71])], "clipboard.png", {
      type: "image/png",
    });
    const text = new File([new Uint8Array([116, 101, 120, 116])], "note.txt", {
      type: "text/plain",
    });

    const files = extractClipboardImageFiles({
      files: [image, text],
      items: [],
    });

    expect(files).toEqual([image]);
  });

  it("builds image content with a trailing paragraph for continued typing", () => {
    expect(
      buildNoteImageInsertContent([
        {
          alt: "截图",
          src: "/api/note-images/example",
          title: "截图",
        },
      ]),
    ).toEqual([
      {
        attrs: {
          alt: "截图",
          src: "/api/note-images/example",
          title: "截图",
        },
        type: "image",
      },
      {
        type: "paragraph",
      },
    ]);
  });

  it("falls back to a generated id when randomUUID is unavailable", () => {
    const originalCrypto = globalThis.crypto;
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: {},
    });

    try {
      expect(createClientUploadId()).toMatch(/^note-image-\d+-[a-z0-9]+$/);
    } finally {
      Object.defineProperty(globalThis, "crypto", {
        configurable: true,
        value: originalCrypto,
      });
    }
  });
});
