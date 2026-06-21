import { generateHTML } from "@tiptap/html";
import { generateText } from "@tiptap/core";
import sanitizeHtml from "sanitize-html";
import {
  createNoteRenderExtensions,
  emptyNoteDocument,
  NoteDocumentDto,
} from "@/shared/note-document";

const sanitizeOptions: sanitizeHtml.IOptions = {
  allowedTags: [
    "aside",
    "div",
    "p",
    "br",
    "h1",
    "h2",
    "h3",
    "strong",
    "b",
    "em",
    "i",
    "u",
    "s",
    "ul",
    "ol",
    "li",
    "table",
    "tbody",
    "thead",
    "tr",
    "th",
    "td",
    "colgroup",
    "col",
    "blockquote",
    "code",
    "pre",
    "a",
    "img",
  ],
  allowedAttributes: {
    a: ["href", "target", "rel"],
    aside: ["class", "data-callout-kind", "data-note-callout"],
    div: ["class"],
    img: ["src", "alt", "title", "class"],
    table: ["class"],
    th: ["colspan", "rowspan", "colwidth"],
    td: ["colspan", "rowspan", "colwidth"],
    col: ["span"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  allowProtocolRelative: false,
  transformTags: {
    a: (_tagName, attribs) => ({
      tagName: "a",
      attribs: {
        ...attribs,
        target: "_blank",
        rel: "noreferrer noopener",
      },
    }),
    div: (_tagName, attribs): sanitizeHtml.Tag => {
      if (attribs.class === "tableWrapper") {
        return { tagName: "div", attribs: { class: "tableWrapper" } };
      }
      return { tagName: "p", attribs: {} };
    },
  },
};

export function sanitizeNoteHtml(value: string) {
  let textLength = 0;
  const html = sanitizeHtml(value, {
    ...sanitizeOptions,
    textFilter(text) {
      textLength += Array.from(text).length;
      return text;
    },
  });

  return {
    html,
    textLength,
    isEmpty: textLength === 0,
  };
}

export function plainTextToNoteHtml(value: string) {
  return sanitizeHtml(value, {
    allowedTags: [],
    allowedAttributes: {},
  }).replace(/\r?\n/g, "<br>");
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeMarkdownLink(value: string) {
  const trimmed = value.trim();
  if (/^(https?:\/\/|mailto:)/i.test(trimmed)) return trimmed;
  return null;
}

function renderInlineMarkdown(value: string) {
  let html = escapeHtml(value);
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  html = html.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (_match, label: string, url: string) => {
      const href = normalizeMarkdownLink(url);
      return href
        ? `<a href="${escapeHtml(href)}">${label}</a>`
        : label;
    },
  );
  return html;
}

function renderMarkdownBlocks(value: string) {
  const lines = value.replace(/\r\n/g, "\n").split("\n");
  const blocks: string[] = [];
  let paragraph: string[] = [];
  let listItems: string[] = [];
  let quoteLines: string[] = [];
  let codeLines: string[] | null = null;

  function flushParagraph() {
    if (paragraph.length === 0) return;
    blocks.push(`<p>${paragraph.map(renderInlineMarkdown).join("<br>")}</p>`);
    paragraph = [];
  }

  function flushList() {
    if (listItems.length === 0) return;
    blocks.push(`<ul>${listItems.map((item) => `<li>${renderInlineMarkdown(item)}</li>`).join("")}</ul>`);
    listItems = [];
  }

  function flushQuote() {
    if (quoteLines.length === 0) return;
    blocks.push(`<blockquote>${quoteLines.map(renderInlineMarkdown).join("<br>")}</blockquote>`);
    quoteLines = [];
  }

  function flushCode() {
    if (!codeLines) return;
    blocks.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
    codeLines = null;
  }

  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      if (codeLines) {
        flushCode();
      } else {
        flushParagraph();
        flushList();
        flushQuote();
        codeLines = [];
      }
      continue;
    }

    if (codeLines) {
      codeLines.push(line);
      continue;
    }

    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      flushList();
      flushQuote();
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(trimmed);
    if (heading) {
      flushParagraph();
      flushList();
      flushQuote();
      blocks.push(`<h${heading[1].length}>${renderInlineMarkdown(heading[2])}</h${heading[1].length}>`);
      continue;
    }

    const listItem = /^[-*]\s+(.+)$/.exec(trimmed);
    if (listItem) {
      flushParagraph();
      flushQuote();
      listItems.push(listItem[1]);
      continue;
    }

    const quote = /^>\s?(.+)$/.exec(trimmed);
    if (quote) {
      flushParagraph();
      flushList();
      quoteLines.push(quote[1]);
      continue;
    }

    flushList();
    flushQuote();
    paragraph.push(line);
  }

  flushParagraph();
  flushList();
  flushQuote();
  flushCode();

  return blocks.join("");
}

export function markdownToSafeHtml(value: string) {
  return sanitizeHtml(renderMarkdownBlocks(value), sanitizeOptions);
}

export function markdownToPlainText(value: string) {
  return sanitizeHtml(value, {
    allowedTags: [],
    allowedAttributes: {},
  })
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*_\-[\]()`]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateText(value: string, maxLength: number) {
  return Array.from(value).slice(0, maxLength).join("");
}

export function noteDocumentToSafeHtml(value: NoteDocumentDto) {
  return sanitizeHtml(generateHTML(value, createNoteRenderExtensions()), sanitizeOptions);
}

export function noteDocumentToPlainText(value: NoteDocumentDto) {
  return generateText(value, createNoteRenderExtensions())
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeNoteDocument(value: NoteDocumentDto | null | undefined) {
  if (!value || typeof value !== "object") return emptyNoteDocument;
  if (!("type" in value) || value.type !== "doc") {
    return { ...emptyNoteDocument, content: [value] };
  }
  if (!Array.isArray(value.content) || value.content.length === 0) {
    return emptyNoteDocument;
  }
  return value;
}

export function noteDocumentToExcerpt(value: NoteDocumentDto) {
  return truncateText(noteDocumentToPlainText(value), 160);
}

export function noteDocumentToTitle(
  explicitTitle: string | null | undefined,
  value: NoteDocumentDto,
) {
  const title = explicitTitle?.trim();
  if (title) return title;
  const fallback = truncateText(noteDocumentToPlainText(value), 100);
  return fallback || "未命名 Note";
}

export function legacyMarkdownToNoteDocument(markdown: string) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const content: NoteDocumentDto[] = [];
  let paragraph: string[] = [];
  let listItems: string[] = [];

  function flushParagraph() {
    if (paragraph.length === 0) return;
    content.push({
      type: "paragraph",
      content: [{ type: "text", text: paragraph.join(" ") }],
    });
    paragraph = [];
  }

  function flushList() {
    if (listItems.length === 0) return;
    content.push({
      type: "bulletList",
      content: listItems.map((item) => ({
        type: "listItem",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: item }],
          },
        ],
      })),
    });
    listItems = [];
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      content.push({
        type: "heading",
        attrs: { level: heading[1].length },
        content: [{ type: "text", text: heading[2] }],
      });
      continue;
    }

    const listItem = /^[-*]\s+(.+)$/.exec(line);
    if (listItem) {
      flushParagraph();
      listItems.push(listItem[1]);
      continue;
    }

    paragraph.push(line);
  }

  flushParagraph();
  flushList();

  return content.length > 0 ? { type: "doc", content } : emptyNoteDocument;
}
