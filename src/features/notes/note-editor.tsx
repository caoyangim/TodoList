"use client";

import type { Editor } from "@tiptap/react";
import { EditorContent, useEditor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import {
  Bold,
  Columns3,
  Code,
  Grid2x2,
  Heading1,
  Heading2,
  Heading3,
  Info,
  Link2,
  List,
  ListOrdered,
  Minus,
  ExternalLink,
  Quote,
  RemoveFormatting,
  Save,
  SquareCheck,
  Trash2,
  Underline as UnderlineIcon,
  Rows3,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { LoadingSpinner } from "@/components/loading";
import { getApiErrorMessage } from "@/shared/api-client";
import { uploadNoteImage } from "@/shared/note-image-client";
import { createNoteEditorExtensions, NoteDocumentDto } from "@/shared/note-document";
import { NoteDto } from "@/shared/types/models";

type SlashCommandItem = {
  id: string;
  label: string;
  description: string;
  keywords: string[];
  action: () => void;
};

type SlashMenuState = {
  query: string;
  from: number;
  to: number;
  top: number;
  left: number;
};

type MarkdownShortcutAction =
  | { type: "heading"; level: 1 | 2 | 3 }
  | { type: "bulletList" }
  | { type: "orderedList" }
  | { type: "taskList"; checked?: boolean }
  | { type: "blockquote" }
  | { type: "codeBlock" };

type PendingImageUpload = {
  errorMessage?: string;
  id: string;
  left: number;
  file: File;
  name: string;
  order: number;
  pos: number;
  previewUrl: string;
  status: "failed" | "processing" | "uploading";
  top: number;
};

function normalizeLink(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^(https?:\/\/|mailto:)/i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function preloadNoteImage(src: string) {
  return new Promise<void>((resolve) => {
    const image = new window.Image();
    image.onload = () => resolve();
    image.onerror = () => resolve();
    image.src = src;
  });
}

function openSafeExternalLink(value: string | null | undefined) {
  const normalized = value ? normalizeLink(value) : null;
  if (!normalized) return false;
  window.open(normalized, "_blank", "noopener,noreferrer");
  return true;
}

function insertPastedImages(_editor: Editor, items: DataTransferItem[]) {
  const imageItems = items.filter((item) => item.type.startsWith("image/"));
  if (imageItems.length === 0) return false;

  const files = imageItems.map((item) => item.getAsFile()).filter((file): file is File => Boolean(file));
  return files;
}

function getMarkdownShortcutAction(value: string): MarkdownShortcutAction | null {
  const trimmed = value.trim();
  if (trimmed === "#") return { type: "heading", level: 1 };
  if (trimmed === "##") return { type: "heading", level: 2 };
  if (trimmed === "###") return { type: "heading", level: 3 };
  if (trimmed === "-") return { type: "bulletList" };
  if (/^1\.$/.test(trimmed)) return { type: "orderedList" };
  if (trimmed === "[]" || trimmed === "[ ]") return { type: "taskList" };
  if (trimmed === "[x]" || trimmed === "[X]") return { type: "taskList", checked: true };
  if (trimmed === ">") return { type: "blockquote" };
  if (trimmed === "```" || trimmed === "~~~") return { type: "codeBlock" };
  return null;
}

function applyMarkdownShortcut(editor: Editor, action: MarkdownShortcutAction) {
  const { selection } = editor.state;
  if (!selection.empty) return false;
  const { $from, from } = selection;
  if (!$from.parent.isTextblock) return false;

  const blockStart = $from.start();
  const range = { from: blockStart, to: from };
  const chain = editor.chain().focus().deleteRange(range);

  switch (action.type) {
    case "heading":
      return chain.toggleHeading({ level: action.level }).run();
    case "bulletList":
      return chain.toggleBulletList().run();
    case "orderedList":
      return chain.toggleOrderedList().run();
    case "taskList": {
      const succeeded = chain.toggleTaskList().run();
      if (!succeeded || !action.checked) return succeeded;
      return editor.chain().focus().updateAttributes("taskItem", { checked: true }).run();
    }
    case "blockquote":
      return chain.toggleBlockquote().run();
    case "codeBlock":
      return chain.toggleCodeBlock().run();
  }
}

export function NoteEditor({
  note,
  title,
  content,
  saving,
  deleting,
  dirty,
  onTitleChange,
  onContentChange,
  onSaveNow,
  onDelete,
}: {
  note: NoteDto;
  title: string;
  content: NoteDocumentDto;
  saving: boolean;
  deleting: boolean;
  dirty: boolean;
  onTitleChange: (value: string) => void;
  onContentChange: (value: NoteDocumentDto) => void;
  onSaveNow: () => void;
  onDelete: () => void;
}) {
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [pendingImageUploads, setPendingImageUploads] = useState<PendingImageUpload[]>([]);
  const [slashMenu, setSlashMenu] = useState<SlashMenuState | null>(null);
  const [slashSelectedIndex, setSlashSelectedIndex] = useState(0);
  const [linkEditorOpen, setLinkEditorOpen] = useState(false);
  const [linkValue, setLinkValue] = useState("");
  const editorRef = useRef<Editor | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const busy = saving || deleting;

  function openImagePicker() {
    imageInputRef.current?.click();
  }

  function insertBasicTable() {
    editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  }

  function removePendingImageUploads(ids: string[]) {
    setPendingImageUploads((current) => {
      const idSet = new Set(ids);
      for (const item of current) {
        if (idSet.has(item.id)) {
          URL.revokeObjectURL(item.previewUrl);
        }
      }
      return current.filter((item) => !idSet.has(item.id));
    });
  }

  function updatePendingImageUploads(
    ids: string[],
    updater: (item: PendingImageUpload) => PendingImageUpload,
  ) {
    setPendingImageUploads((current) => {
      const idSet = new Set(ids);
      return current.map((item) => (idSet.has(item.id) ? updater(item) : item));
    });
  }

  function createPendingImageUploads(
    files: File[],
    anchor: { left: number; pos: number; top: number },
  ) {
    return files.map((file, index) => ({
      id: crypto.randomUUID(),
      file,
      left: anchor.left,
      name: file.name || `图片 ${index + 1}`,
      order: index,
      pos: anchor.pos,
      previewUrl: URL.createObjectURL(file),
      status: "uploading" as const,
      top: anchor.top + index * 108,
    }));
  }

  function getUploadAnchor(currentEditor: Editor) {
    const body = bodyRef.current;
    if (!body) return null;

    const position = currentEditor.state.selection.from;
    const coords = currentEditor.view.coordsAtPos(position);
    const bounds = body.getBoundingClientRect();

    return {
      left: coords.left - bounds.left + body.scrollLeft,
      pos: position,
      top: coords.top - bounds.top + body.scrollTop,
    };
  }

  function openLinkEditor() {
    if (!editor) return;
    setLinkValue(editor.getAttributes("link").href ?? "");
    setLinkEditorOpen(true);
  }

  function applyLinkFromBubble() {
    if (!editor) return;
    const normalized = normalizeLink(linkValue);
    if (!normalized) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    } else {
      editor.chain().focus().extendMarkRange("link").setLink({ href: normalized }).run();
    }
    setLinkEditorOpen(false);
  }

  async function handleImageUpload(files: File[]) {
    const currentEditor = editorRef.current;
    if (!currentEditor || files.length === 0) return;
    const anchor = getUploadAnchor(currentEditor);
    if (!anchor) return;

    const placeholders = createPendingImageUploads(files, anchor);
    setUploadError("");
    setPendingImageUploads((current) => [...current, ...placeholders]);
    void processImageUploadBatch(placeholders, "图片上传失败");
  }

  async function processImageUploadBatch(
    placeholders: PendingImageUpload[],
    fallbackMessage: string,
  ) {
    const currentEditor = editorRef.current;
    if (!currentEditor || placeholders.length === 0) return;

    setUploadingImage(true);
    const results = await Promise.allSettled(
      placeholders.map((item) => uploadNoteImage(item.file)),
    );

    const successItems: Array<{ item: PendingImageUpload; image: Awaited<ReturnType<typeof uploadNoteImage>> }> = [];
    const failedIds: string[] = [];
    let latestError = "";

    results.forEach((result, index) => {
      const item = placeholders[index];
      if (!item) return;
      if (result.status === "fulfilled") {
        successItems.push({ item, image: result.value });
        return;
      }
      failedIds.push(item.id);
      latestError = getApiErrorMessage(result.reason, fallbackMessage);
    });

    if (successItems.length > 0) {
      updatePendingImageUploads(
        successItems.map(({ item }) => item.id),
        (item) => ({
          ...item,
          status: "processing",
        }),
      );

      await Promise.all(
        successItems.map(({ image }) => preloadNoteImage(image.url)),
      );

      const groups = new Map<number, Array<{ item: PendingImageUpload; image: Awaited<ReturnType<typeof uploadNoteImage>> }>>();
      for (const entry of successItems) {
        const group = groups.get(entry.item.pos) ?? [];
        group.push(entry);
        groups.set(entry.item.pos, group);
      }

      for (const [pos, entries] of groups) {
        const sortedEntries = [...entries].sort((a, b) => a.item.order - b.item.order);
        currentEditor
          .chain()
          .focus()
          .insertContentAt(
            pos,
            sortedEntries.map(({ item, image }) => ({
              attrs: {
                alt: item.name || "图片",
                src: image.url,
                title: item.name || "图片",
              },
              type: "image",
            })),
          )
          .run();
      }

      removePendingImageUploads(successItems.map(({ item }) => item.id));
    }

    if (failedIds.length > 0) {
      setUploadError(latestError);
      updatePendingImageUploads(failedIds, (item) => ({
        ...item,
        errorMessage: latestError,
        status: "failed",
      }));
    }

    setUploadingImage(false);
  }

  function retryPendingImageUpload(id: string) {
    const target = pendingImageUploads.find((item) => item.id === id);
    if (!target) return;
    setUploadError("");
    updatePendingImageUploads([id], (item) => ({
      ...item,
      errorMessage: "",
      status: "uploading",
    }));
    void processImageUploadBatch([{ ...target, errorMessage: "", status: "uploading" }], "图片重试失败");
  }

  const editor = useEditor({
    content,
    editorProps: {
      attributes: {
        class: "note-document-input",
      },
      handleKeyDown(_view, event) {
        if (!slashMenu) return false;

        if (event.key === "ArrowDown") {
          event.preventDefault();
          setSlashSelectedIndex((current) =>
            slashItems.length === 0 ? 0 : (current + 1) % slashItems.length,
          );
          return true;
        }

        if (event.key === "ArrowUp") {
          event.preventDefault();
          setSlashSelectedIndex((current) =>
            slashItems.length === 0 ? 0 : (current - 1 + slashItems.length) % slashItems.length,
          );
          return true;
        }

        if (event.key === "Enter") {
          const selectedItem = slashItems[slashSelectedIndex];
          if (!selectedItem) return false;
          event.preventDefault();
          selectedItem.action();
          return true;
        }

        if (event.key === "Escape") {
          event.preventDefault();
          setSlashMenu(null);
          return true;
        }

        return false;
      },
      handleClick(_view, _pos, event) {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return false;

        const anchor = target.closest("a[href]");
        if (!(anchor instanceof HTMLAnchorElement)) return false;
        if (!(event.metaKey || event.ctrlKey)) return false;

        event.preventDefault();
        return openSafeExternalLink(anchor.getAttribute("href"));
      },
      handleTextInput(_view, from, to, text) {
        if (text !== " ") return false;
        const currentEditor = editorRef.current;
        if (!currentEditor) return false;

        const { selection } = currentEditor.state;
        if (!selection.empty) return false;
        const { $from } = selection;
        if (!$from.parent.isTextblock) return false;

        const textBefore = $from.parent.textBetween(0, $from.parentOffset, "\0", "\0");
        const action = getMarkdownShortcutAction(textBefore);
        if (!action) return false;

        return applyMarkdownShortcut(currentEditor, action);
      },
      handlePaste(_view, event) {
        const items = Array.from(event.clipboardData?.items ?? []);
        if (!items.some((item) => item.type.startsWith("image/"))) {
          return false;
        }

        const currentEditor = editorRef.current;
        if (!currentEditor) return false;
        const anchor = getUploadAnchor(currentEditor);
        if (!anchor) return false;

        event.preventDefault();
        const files = insertPastedImages(currentEditor, items);
        if (!files || files.length === 0) return true;

        const placeholders = createPendingImageUploads(files, anchor);
        setUploadError("");
        setPendingImageUploads((current) => [...current, ...placeholders]);
        void processImageUploadBatch(placeholders, "图片粘贴失败");
        return true;
      },
    },
    extensions: createNoteEditorExtensions({
      placeholder: "开始记录内容",
    }),
    immediatelyRender: false,
    onUpdate: ({ editor: nextEditor }) => {
      onContentChange(nextEditor.getJSON());
    },
  });

  function runSlashCommand(action: () => void) {
    if (!editor || !slashMenu) return;
    editor.chain().focus().deleteRange({ from: slashMenu.from, to: slashMenu.to }).run();
    action();
    setSlashMenu(null);
    setSlashSelectedIndex(0);
  }

  const slashItems: SlashCommandItem[] = slashMenu && editor ? [
    {
      id: "paragraph",
      label: "正文",
      description: "插入普通段落",
      keywords: ["text", "paragraph", "正文", "段落"],
      action: () => runSlashCommand(() => editor.chain().focus().setParagraph().run()),
    },
    {
      id: "heading-1",
      label: "标题 1",
      description: "大标题",
      keywords: ["h1", "title", "标题1", "一级标题"],
      action: () => runSlashCommand(() => editor.chain().focus().toggleHeading({ level: 1 }).run()),
    },
    {
      id: "heading-2",
      label: "标题 2",
      description: "中标题",
      keywords: ["h2", "subtitle", "标题2", "二级标题"],
      action: () => runSlashCommand(() => editor.chain().focus().toggleHeading({ level: 2 }).run()),
    },
    {
      id: "heading-3",
      label: "标题 3",
      description: "小标题",
      keywords: ["h3", "标题3", "三级标题"],
      action: () => runSlashCommand(() => editor.chain().focus().toggleHeading({ level: 3 }).run()),
    },
    {
      id: "bullet-list",
      label: "无序列表",
      description: "使用圆点组织内容",
      keywords: ["list", "bullet", "ul", "列表", "无序"],
      action: () => runSlashCommand(() => editor.chain().focus().toggleBulletList().run()),
    },
    {
      id: "ordered-list",
      label: "有序列表",
      description: "使用序号组织内容",
      keywords: ["list", "ordered", "ol", "列表", "有序"],
      action: () => runSlashCommand(() => editor.chain().focus().toggleOrderedList().run()),
    },
    {
      id: "task-list",
      label: "任务列表",
      description: "插入可勾选列表",
      keywords: ["task", "todo", "checkbox", "任务", "待办"],
      action: () => runSlashCommand(() => editor.chain().focus().toggleTaskList().run()),
    },
    {
      id: "blockquote",
      label: "引用",
      description: "强调引用内容",
      keywords: ["quote", "blockquote", "引用"],
      action: () => runSlashCommand(() => editor.chain().focus().toggleBlockquote().run()),
    },
    {
      id: "code-block",
      label: "代码块",
      description: "插入预格式化代码",
      keywords: ["code", "snippet", "代码"],
      action: () => runSlashCommand(() => editor.chain().focus().toggleCodeBlock().run()),
    },
    {
      id: "divider",
      label: "分割线",
      description: "插入内容分隔",
      keywords: ["divider", "hr", "horizontal rule", "分割线"],
      action: () => runSlashCommand(() => editor.chain().focus().setHorizontalRule().run()),
    },
    {
      id: "image",
      label: "图片",
      description: "选择图片并插入",
      keywords: ["image", "photo", "图片", "插图"],
      action: () => runSlashCommand(() => openImagePicker()),
    },
    {
      id: "callout",
      label: "提示块",
      description: "插入提示信息块",
      keywords: ["callout", "info", "tip", "提示", "提示框"],
      action: () => runSlashCommand(() => editor.chain().focus().toggleCallout().run()),
    },
    {
      id: "table",
      label: "表格",
      description: "插入基础表格",
      keywords: ["table", "grid", "表格", "单元格"],
      action: () => runSlashCommand(() => insertBasicTable()),
    },
  ].filter((item) => {
    const query = slashMenu.query.trim().toLowerCase();
    if (!query) return true;
    return [item.label, item.description, ...item.keywords].some((value) =>
      value.toLowerCase().includes(query),
    );
  }) : [];

  useEffect(() => {
    editorRef.current = editor ?? null;
    return () => {
      editorRef.current = null;
    };
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    const current = JSON.stringify(editor.getJSON());
    const next = JSON.stringify(content);
    if (current !== next) {
      editor.commands.setContent(content, { emitUpdate: false });
    }
  }, [content, editor]);

  useEffect(() => {
    if (!slashMenu) return;
    if (slashItems.length === 0) {
      setSlashSelectedIndex(0);
      return;
    }
    setSlashSelectedIndex((current) => Math.min(current, slashItems.length - 1));
  }, [slashItems.length, slashMenu]);

  useEffect(() => {
    setSlashSelectedIndex(0);
  }, [slashMenu?.query]);

  useEffect(() => {
    if (!editor || !linkEditorOpen) return;
    const currentEditor = editor;

    function closeIfSelectionCleared() {
      if (currentEditor.state.selection.empty) {
        setLinkEditorOpen(false);
      }
    }

    currentEditor.on("selectionUpdate", closeIfSelectionCleared);
    return () => {
      currentEditor.off("selectionUpdate", closeIfSelectionCleared);
    };
  }, [editor, linkEditorOpen]);

  useEffect(() => {
    if (!editor) return;
    const currentEditor = editor;

    function updateSlashMenu() {
      const body = bodyRef.current;
      if (!body) {
        setSlashMenu(null);
        return;
      }

      const { state, view } = currentEditor;
      const { selection } = state;
      if (!selection.empty) {
        setSlashMenu(null);
        return;
      }

      const { $from, from } = selection;
      if (!$from.parent.isTextblock) {
        setSlashMenu(null);
        return;
      }

      const textBefore = $from.parent.textBetween(0, $from.parentOffset, "\0", "\0");
      const match = /^(\s*)\/([^\s/]*)$/.exec(textBefore);
      if (!match) {
        setSlashMenu(null);
        return;
      }

      const slashFrom = $from.start() + match[1].length;
      const coords = view.coordsAtPos(from);
      const bounds = body.getBoundingClientRect();
      setSlashMenu({
        query: match[2],
        from: slashFrom,
        to: from,
        top: coords.bottom - bounds.top + body.scrollTop + 8,
        left: coords.left - bounds.left + body.scrollLeft,
      });
    }

    updateSlashMenu();
    currentEditor.on("update", updateSlashMenu);
    currentEditor.on("selectionUpdate", updateSlashMenu);

    return () => {
      currentEditor.off("update", updateSlashMenu);
      currentEditor.off("selectionUpdate", updateSlashMenu);
    };
  }, [editor]);

  function setLink() {
    if (!editor) return;
    const previousUrl = editor.getAttributes("link").href ?? "";
    const value = window.prompt("请输入链接地址", previousUrl);
    if (value === null) return;

    const normalized = normalizeLink(value);
    if (!normalized) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }

    editor.chain().focus().extendMarkRange("link").setLink({ href: normalized }).run();
  }

  const toolbarButtons: Array<{
    label: string;
    icon: React.ReactNode;
    active?: boolean;
    action: () => void;
  }> = [
    {
      label: "正文",
      icon: <Minus size={15} />,
      active: editor?.isActive("paragraph"),
      action: () => editor?.chain().focus().setParagraph().run(),
    },
    {
      label: "标题 1",
      icon: <Heading1 size={15} />,
      active: editor?.isActive("heading", { level: 1 }),
      action: () => editor?.chain().focus().toggleHeading({ level: 1 }).run(),
    },
    {
      label: "标题 2",
      icon: <Heading2 size={15} />,
      active: editor?.isActive("heading", { level: 2 }),
      action: () => editor?.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
      label: "标题 3",
      icon: <Heading3 size={15} />,
      active: editor?.isActive("heading", { level: 3 }),
      action: () => editor?.chain().focus().toggleHeading({ level: 3 }).run(),
    },
    {
      label: "加粗",
      icon: <Bold size={15} />,
      active: editor?.isActive("bold"),
      action: () => editor?.chain().focus().toggleBold().run(),
    },
    {
      label: "下划线",
      icon: <UnderlineIcon size={15} />,
      active: editor?.isActive("underline"),
      action: () => editor?.chain().focus().toggleUnderline().run(),
    },
    {
      label: "无序列表",
      icon: <List size={15} />,
      active: editor?.isActive("bulletList"),
      action: () => editor?.chain().focus().toggleBulletList().run(),
    },
    {
      label: "有序列表",
      icon: <ListOrdered size={15} />,
      active: editor?.isActive("orderedList"),
      action: () => editor?.chain().focus().toggleOrderedList().run(),
    },
    {
      label: "引用",
      icon: <Quote size={15} />,
      active: editor?.isActive("blockquote"),
      action: () => editor?.chain().focus().toggleBlockquote().run(),
    },
    {
      label: "任务列表",
      icon: <SquareCheck size={15} />,
      active: editor?.isActive("taskList"),
      action: () => editor?.chain().focus().toggleTaskList().run(),
    },
    {
      label: "代码块",
      icon: <Code size={15} />,
      active: editor?.isActive("codeBlock"),
      action: () => editor?.chain().focus().toggleCodeBlock().run(),
    },
    {
      label: "提示块",
      icon: <Info size={15} />,
      active: editor?.isActive("callout"),
      action: () => editor?.chain().focus().toggleCallout().run(),
    },
    {
      label: "表格",
      icon: <Grid2x2 size={15} />,
      active: editor?.isActive("table"),
      action: insertBasicTable,
    },
    {
      label: "链接",
      icon: <Link2 size={15} />,
      active: editor?.isActive("link"),
      action: setLink,
    },
  ];

  return (
    <div className="note-editor" key={note.id}>
      <input
        accept="image/*"
        className="sr-only"
        multiple
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          void handleImageUpload(files);
          event.target.value = "";
        }}
        ref={imageInputRef}
        type="file"
      />
      <header className="note-editor-header">
        <input
          aria-label="Note 标题"
          className="note-title-input"
          disabled={busy}
          maxLength={100}
          onChange={(event) => onTitleChange(event.target.value)}
          placeholder="未命名 Note"
          value={title}
        />
        <div className="note-editor-actions">
          <span className="note-save-state">
            {uploadingImage ? "图片上传中" : saving ? "保存中" : dirty ? "正在编辑" : "已保存"}
          </span>
          <button
            className="button"
            disabled={busy || !dirty}
            onClick={onSaveNow}
            type="button"
          >
            {saving ? <LoadingSpinner /> : <Save size={15} />}
            立即保存
          </button>
          <button
            aria-label="删除 Note"
            className="button ghost icon-only danger"
            disabled={busy}
            onClick={onDelete}
            title="删除 Note"
            type="button"
          >
            {deleting ? <LoadingSpinner /> : <Trash2 size={16} />}
          </button>
        </div>
      </header>

      <div className="note-toolbar" role="toolbar" aria-label="文档格式">
        {toolbarButtons.map((button) => (
          <button
            aria-label={button.label}
            aria-pressed={button.active}
            className={`button icon-only${button.active ? " active" : ""}`}
            disabled={busy || !editor}
            key={button.label}
            onMouseDown={(event) => event.preventDefault()}
            onClick={button.action}
            title={button.label}
            type="button"
          >
            {button.icon}
          </button>
        ))}
      </div>
      {editor?.isActive("table") ? (
        <div className="note-table-toolbar" role="toolbar" aria-label="表格操作">
          <button
            className="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => editor.chain().focus().addRowAfter().run()}
            type="button"
          >
            <Rows3 size={15} />
            新增行
          </button>
          <button
            className="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => editor.chain().focus().addColumnAfter().run()}
            type="button"
          >
            <Columns3 size={15} />
            新增列
          </button>
          <button
            className="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => editor.chain().focus().toggleHeaderRow().run()}
            type="button"
          >
            切换表头
          </button>
          <button
            className="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => editor.chain().focus().deleteRow().run()}
            type="button"
          >
            删除当前行
          </button>
          <button
            className="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => editor.chain().focus().deleteColumn().run()}
            type="button"
          >
            删除当前列
          </button>
          <button
            className="button danger"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => editor.chain().focus().deleteTable().run()}
            type="button"
          >
            删除表格
          </button>
        </div>
      ) : null}

      <div
        className={`note-editor-body${uploadingImage ? " uploading" : ""}`}
        aria-busy={uploadingImage}
        ref={bodyRef}
      >
        {pendingImageUploads.map((item) => (
          <div
            className="note-image-placeholder"
            key={item.id}
            style={{ left: `${item.left}px`, top: `${item.top}px` }}
          >
            <div className="note-image-placeholder-preview">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt={item.name} src={item.previewUrl} />
            </div>
            <div className="note-image-placeholder-meta">
              <span className="note-image-placeholder-title">{item.name}</span>
              {item.status === "uploading" ? (
                <span className="note-image-placeholder-status">
                  <LoadingSpinner size={14} />
                  正在上传图片...
                </span>
              ) : item.status === "processing" ? (
                <span className="note-image-placeholder-status">
                  <LoadingSpinner size={14} />
                  正在插入图片...
                </span>
              ) : (
                <div className="note-image-placeholder-actions">
                  <span className="note-image-placeholder-error">
                    {item.errorMessage || "图片上传失败"}
                  </span>
                  <button
                    className="button"
                    onClick={() => retryPendingImageUpload(item.id)}
                    type="button"
                  >
                    重试上传
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
        {editor ? (
          <BubbleMenu
            className="note-bubble-menu"
            editor={editor}
            options={{ placement: "top" }}
            shouldShow={({ editor: currentEditor, from, to }) =>
              currentEditor.isEditable &&
              !slashMenu &&
              !uploadingImage &&
              (from !== to || currentEditor.isActive("link"))
            }
          >
            <button
              aria-label="加粗"
              aria-pressed={editor.isActive("bold")}
              className={`button icon-only${editor.isActive("bold") ? " active" : ""}`}
              onClick={() => editor.chain().focus().toggleBold().run()}
              title="加粗"
              type="button"
            >
              <Bold size={15} />
            </button>
            <button
              aria-label="下划线"
              aria-pressed={editor.isActive("underline")}
              className={`button icon-only${editor.isActive("underline") ? " active" : ""}`}
              onClick={() => editor.chain().focus().toggleUnderline().run()}
              title="下划线"
              type="button"
            >
              <UnderlineIcon size={15} />
            </button>
            <button
              aria-label="行内代码"
              aria-pressed={editor.isActive("code")}
              className={`button icon-only${editor.isActive("code") ? " active" : ""}`}
              onClick={() => editor.chain().focus().toggleCode().run()}
              title="行内代码"
              type="button"
            >
              <Code size={15} />
            </button>
            {linkEditorOpen ? (
              <form
                className="note-bubble-link-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  applyLinkFromBubble();
                }}
              >
                <input
                  className="note-bubble-link-input"
                  onChange={(event) => setLinkValue(event.target.value)}
                  placeholder="输入链接地址"
                  value={linkValue}
                />
                <button className="button" type="submit">
                  应用
                </button>
              </form>
            ) : (
              <>
                <button
                  aria-label="链接"
                  aria-pressed={editor.isActive("link")}
                  className={`button icon-only${editor.isActive("link") ? " active" : ""}`}
                  onClick={openLinkEditor}
                  title="链接"
                  type="button"
                >
                  <Link2 size={15} />
                </button>
                {editor.isActive("link") ? (
                  <button
                    aria-label="打开链接"
                    className="button icon-only"
                    onClick={() => openSafeExternalLink(editor.getAttributes("link").href)}
                    title="打开链接"
                    type="button"
                  >
                    <ExternalLink size={15} />
                  </button>
                ) : null}
              </>
            )}
            <button
              aria-label="清除格式"
              className="button icon-only"
              onClick={() => editor.chain().focus().unsetAllMarks().run()}
              title="清除格式"
              type="button"
            >
              <RemoveFormatting size={15} />
            </button>
          </BubbleMenu>
        ) : null}
        {uploadingImage ? (
          <div className="note-editor-uploading" role="status" aria-live="polite">
            <span className="note-editor-uploading-indicator">
              <LoadingSpinner size={15} />
              <span>正在上传图片...</span>
            </span>
          </div>
        ) : null}
        {slashMenu ? (
          <div
            className="note-slash-menu"
            style={{ left: `${slashMenu.left}px`, top: `${slashMenu.top}px` }}
          >
            {slashItems.length > 0 ? (
              slashItems.map((item, index) => (
                <button
                  className={`note-slash-item${index === slashSelectedIndex ? " active" : ""}`}
                  key={item.id}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={item.action}
                  type="button"
                >
                  <span className="note-slash-item-label">{item.label}</span>
                  <span className="note-slash-item-description">{item.description}</span>
                </button>
              ))
            ) : (
              <div className="note-slash-empty">没有匹配的命令</div>
            )}
          </div>
        ) : null}
        <EditorContent editor={editor} />
      </div>
      <div className="note-editor-footer">
        <span className="note-editor-hint">
          支持 / 命令、粘贴图片、Ctrl/Cmd + 点击链接打开，以及 `#`、`-`、`1.`、`[]`、`&gt;`、``` 快捷输入
        </span>
        {uploadError ? <span className="note-editor-error">{uploadError}</span> : null}
      </div>
    </div>
  );
}
