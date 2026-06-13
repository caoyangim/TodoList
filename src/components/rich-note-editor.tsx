"use client";

import {
  Bold,
  ClipboardPaste,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Code2,
  Quote,
  Strikethrough,
  Trash2,
  Underline,
  Unlink,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { LoadingSpinner } from "@/components/loading";
import { uploadNoteImage } from "@/shared/note-image-client";
import { NoteContentDto, NoteImageDto } from "@/shared/types/models";

const maxImages = 10;
const maxTextLength = 2000;

type EditorCommand =
  | "bold"
  | "italic"
  | "underline"
  | "strikeThrough"
  | "insertUnorderedList"
  | "insertOrderedList";

type ActiveFormats = {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikeThrough: boolean;
  insertUnorderedList: boolean;
  insertOrderedList: boolean;
  blockquote: boolean;
  pre: boolean;
};

const emptyFormats: ActiveFormats = {
  bold: false,
  italic: false,
  underline: false,
  strikeThrough: false,
  insertUnorderedList: false,
  insertOrderedList: false,
  blockquote: false,
  pre: false,
};

function normalizeLink(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^(https?:\/\/|mailto:)/i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function RichNoteEditor({
  value,
  onChange,
  onError,
}: {
  value: NoteContentDto;
  onChange: (value: NoteContentDto) => void;
  onError: (message: string) => void;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const selectionRef = useRef<Range | null>(null);
  const [uploading, setUploading] = useState(false);
  const [textLength, setTextLength] = useState(0);
  const [activeFormats, setActiveFormats] = useState<ActiveFormats>(emptyFormats);
  const [activeLink, setActiveLink] = useState<string | null>(null);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || editor.innerHTML === value.html) return;
    editor.innerHTML = value.html;
    setTextLength(editor.innerText.length);
  }, [value.html]);

  useEffect(() => {
    function handleSelectionChange() {
      saveSelection();
    }
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => document.removeEventListener("selectionchange", handleSelectionChange);
  });

  function emitEditorValue() {
    const editor = editorRef.current;
    if (!editor) return;
    const nextLength = editor.innerText.length;
    setTextLength(nextLength);
    onError(nextLength > maxTextLength ? `备注文字不能超过 ${maxTextLength} 个字符` : "");
    onChange({ ...value, html: editor.innerHTML });
  }

  function saveSelection() {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (
      editor &&
      selection &&
      selection.rangeCount > 0 &&
      editor.contains(selection.anchorNode)
    ) {
      selectionRef.current = selection.getRangeAt(0).cloneRange();
      const anchorElement =
        selection.anchorNode instanceof Element
          ? selection.anchorNode
          : selection.anchorNode?.parentElement;
      const link = anchorElement?.closest("a");
      const block = anchorElement?.closest("blockquote, pre");
      setActiveLink(link instanceof HTMLAnchorElement ? link.href : null);
      setActiveFormats({
        bold: Boolean(anchorElement?.closest("strong, b")),
        italic: Boolean(anchorElement?.closest("em, i")),
        underline: Boolean(anchorElement?.closest("u")),
        strikeThrough: Boolean(anchorElement?.closest("s, strike")),
        insertUnorderedList: Boolean(anchorElement?.closest("ul")),
        insertOrderedList: Boolean(anchorElement?.closest("ol")),
        blockquote: block?.tagName === "BLOCKQUOTE",
        pre: block?.tagName === "PRE",
      });
    }
  }

  function restoreSelection() {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection) return;
    editor.focus();
    selection.removeAllRanges();
    if (selectionRef.current) {
      selection.addRange(selectionRef.current);
      return;
    }
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    selection.addRange(range);
  }

  function getSelectedLink() {
    const container = selectionRef.current?.commonAncestorContainer;
    const element = container instanceof Element ? container : container?.parentElement;
    const link = element?.closest("a");
    return link instanceof HTMLAnchorElement && editorRef.current?.contains(link) ? link : null;
  }

  function runCommand(command: EditorCommand, selectionRequired = false) {
    if (selectionRequired && (!selectionRef.current || selectionRef.current.collapsed)) {
      onError("请先选中需要设置格式的文字");
      return;
    }
    onError("");
    restoreSelection();
    document.execCommand("styleWithCSS", false, "false");
    document.execCommand(command);
    saveSelection();
    emitEditorValue();
  }

  function createLink() {
    const range = selectionRef.current;
    if ((!range || range.collapsed) && !activeLink) {
      onError("请先选中需要添加链接的文字");
      return;
    }
    const url = normalizeLink(window.prompt("请输入链接地址", activeLink ?? "") ?? "");
    if (!url) return;
    onError("");
    const selectedLink = getSelectedLink();
    if (selectedLink) {
      selectedLink.href = url;
      setActiveLink(selectedLink.href);
      emitEditorValue();
      return;
    }
    restoreSelection();
    document.execCommand("createLink", false, url);
    saveSelection();
    emitEditorValue();
  }

  function removeLink() {
    if (!activeLink) {
      onError("当前光标未位于链接文字中");
      return;
    }
    onError("");
    const selectedLink = getSelectedLink();
    if (selectedLink) {
      selectedLink.replaceWith(...Array.from(selectedLink.childNodes));
      setActiveLink(null);
      emitEditorValue();
      return;
    }
    restoreSelection();
    document.execCommand("unlink");
    saveSelection();
    emitEditorValue();
  }

  function formatBlock(tagName: "blockquote" | "pre") {
    onError("");
    restoreSelection();
    document.execCommand("formatBlock", false, tagName);
    saveSelection();
    emitEditorValue();
  }

  async function upload(files: File[]) {
    const imageFiles = files.filter((file) => file.type.startsWith("image/"));
    if (imageFiles.length === 0) return;
    if (value.images.length + imageFiles.length > maxImages) {
      onError(`每条备注最多包含 ${maxImages} 张图片`);
      return;
    }
    setUploading(true);
    onError("");
    try {
      const images = await Promise.all(imageFiles.map(uploadNoteImage));
      onChange({ ...value, images: [...value.images, ...images] });
    } catch (error) {
      onError(error instanceof Error ? error.message : "图片上传失败");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function removeImage(image: NoteImageDto) {
    onChange({ ...value, images: value.images.filter((item) => item.id !== image.id) });
  }

  const toolbarButtons: Array<{
    label: string;
    icon: React.ReactNode;
    action: () => void;
    active?: boolean;
    disabled?: boolean;
  }> = [
    {
      label: "加粗",
      icon: <Bold size={16} />,
      action: () => runCommand("bold", true),
      active: activeFormats.bold,
    },
    {
      label: "斜体",
      icon: <Italic size={16} />,
      action: () => runCommand("italic", true),
      active: activeFormats.italic,
    },
    {
      label: "下划线",
      icon: <Underline size={16} />,
      action: () => runCommand("underline", true),
      active: activeFormats.underline,
    },
    {
      label: "删除线",
      icon: <Strikethrough size={16} />,
      action: () => runCommand("strikeThrough", true),
      active: activeFormats.strikeThrough,
    },
    {
      label: "无序列表",
      icon: <List size={16} />,
      action: () => runCommand("insertUnorderedList"),
      active: activeFormats.insertUnorderedList,
    },
    {
      label: "有序列表",
      icon: <ListOrdered size={16} />,
      action: () => runCommand("insertOrderedList"),
      active: activeFormats.insertOrderedList,
    },
    {
      label: "引用",
      icon: <Quote size={16} />,
      action: () => formatBlock("blockquote"),
      active: activeFormats.blockquote,
    },
    {
      label: "代码块",
      icon: <Code2 size={16} />,
      action: () => formatBlock("pre"),
      active: activeFormats.pre,
    },
    {
      label: activeLink ? "编辑链接" : "添加链接",
      icon: <Link2 size={16} />,
      action: createLink,
      active: Boolean(activeLink),
    },
    {
      label: "移除链接",
      icon: <Unlink size={16} />,
      action: removeLink,
      disabled: !activeLink,
    },
  ];

  return (
    <div className="rich-note-editor">
      <div className="rich-note-toolbar" role="toolbar" aria-label="备注格式">
        {toolbarButtons.map((button) => (
          <button
            aria-label={button.label}
            aria-pressed={button.active}
            className={`button icon-only${button.active ? " active" : ""}`}
            disabled={button.disabled}
            key={button.label}
            onClick={button.action}
            onMouseDown={(event) => event.preventDefault()}
            title={button.label}
            type="button"
          >
            {button.icon}
          </button>
        ))}
      </div>
      {activeLink ? (
        <div className="rich-note-link-status">
          <Link2 size={14} />
          <span title={activeLink}>{activeLink}</span>
          <button onClick={createLink} onMouseDown={(event) => event.preventDefault()} type="button">
            编辑
          </button>
          <button onClick={removeLink} onMouseDown={(event) => event.preventDefault()} type="button">
            移除
          </button>
        </div>
      ) : null}
      <div
        aria-label="备注内容"
        className="rich-note-input"
        contentEditable
        onClick={(event) => {
          const target = event.target instanceof Element ? event.target : null;
          const link = target?.closest("a");
          if (!(link instanceof HTMLAnchorElement)) return;
          event.preventDefault();
          const range = document.createRange();
          range.selectNodeContents(link);
          const selection = window.getSelection();
          selection?.removeAllRanges();
          selection?.addRange(range);
          selectionRef.current = range.cloneRange();
          setActiveLink(link.href);
          saveSelection();
        }}
        onFocus={() => {
          document.execCommand("defaultParagraphSeparator", false, "p");
          saveSelection();
        }}
        onInput={emitEditorValue}
        onKeyUp={saveSelection}
        onMouseUp={saveSelection}
        onPaste={(event) => {
          const files = Array.from(event.clipboardData.items)
            .filter((item) => item.kind === "file")
            .map((item) => item.getAsFile())
            .filter((file): file is File => Boolean(file));
          if (files.some((file) => file.type.startsWith("image/"))) {
            event.preventDefault();
            void upload(files);
          }
        }}
        ref={editorRef}
        role="textbox"
        suppressContentEditableWarning
      />
      {value.images.length > 0 ? (
        <div className="note-image-grid">
          {value.images.map((image) => (
            <figure className="note-image-preview" key={image.id}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt="备注图片" src={image.url} />
              <button
                aria-label="移除图片"
                className="button icon-only note-image-remove"
                onClick={() => removeImage(image)}
                type="button"
              >
                <Trash2 size={14} />
              </button>
            </figure>
          ))}
        </div>
      ) : null}
      <div className="rich-note-footer">
        <span className={`field-hint${textLength > maxTextLength ? " error-text" : ""}`}>
          {textLength} / {maxTextLength} · {value.images.length} / {maxImages} 张图片
        </span>
        <div className="rich-note-tools">
          <span className="paste-hint">
            <ClipboardPaste size={13} /> 支持粘贴图片
          </span>
          <button
            className="button"
            disabled={uploading || value.images.length >= maxImages}
            onClick={() => inputRef.current?.click()}
            type="button"
          >
            {uploading ? <LoadingSpinner /> : <ImagePlus size={15} />}
            {uploading ? "上传中..." : "选择图片"}
          </button>
          <input
            ref={inputRef}
            accept="image/png,image/jpeg,image/webp,image/gif"
            hidden
            multiple
            onChange={(event) => void upload(Array.from(event.target.files ?? []))}
            type="file"
          />
        </div>
      </div>
    </div>
  );
}
