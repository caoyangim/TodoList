import type { JSONContent } from "@tiptap/core";

type ClipboardImageItem = {
  kind?: string;
  type: string;
  getAsFile: () => File | null;
};

type ClipboardImageSource = {
  items?: ArrayLike<ClipboardImageItem> | null;
  files?: ArrayLike<File> | null;
};

type InsertableNoteImage = {
  alt?: string;
  src: string;
  title?: string;
};

function isImageFile(file: File) {
  return file.type.startsWith("image/");
}

function isPresentImageFile(file: File | null): file is File {
  return file instanceof File && isImageFile(file);
}

export function extractClipboardImageFiles(
  clipboardData: ClipboardImageSource | null | undefined,
) {
  const itemFiles = Array.from(clipboardData?.items ?? [])
    .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
    .map((item) => item.getAsFile())
    .filter(isPresentImageFile);

  if (itemFiles.length > 0) {
    return itemFiles;
  }

  return Array.from(clipboardData?.files ?? []).filter(isImageFile);
}

export function buildNoteImageInsertContent(images: InsertableNoteImage[]): JSONContent[] {
  if (images.length === 0) return [];

  return [
    ...images.map((image) => ({
      attrs: {
        alt: image.alt ?? "图片",
        src: image.src,
        title: image.title ?? image.alt ?? "图片",
      },
      type: "image",
    })),
    {
      type: "paragraph",
    },
  ];
}
