import sanitizeHtml from "sanitize-html";

const sanitizeOptions: sanitizeHtml.IOptions = {
  allowedTags: [
    "p",
    "br",
    "strong",
    "b",
    "em",
    "i",
    "u",
    "s",
    "ul",
    "ol",
    "li",
    "blockquote",
    "code",
    "pre",
    "a",
  ],
  allowedAttributes: {
    a: ["href", "target", "rel"],
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
    div: "p",
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
