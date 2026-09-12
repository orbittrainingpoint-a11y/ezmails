import DOMPurify from "dompurify";

/**
 * Sanitize rich-HTML content before it's inserted into the DOM (signatures,
 * compose body) or persisted. Email signatures legitimately need images,
 * links, tables and basic formatting, so this isn't a strict text-only
 * allowlist — but it strips script execution vectors (script tags, inline
 * event handlers, javascript: URIs, iframes/objects/embeds).
 */
export function sanitizeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: [
      "a", "b", "strong", "i", "em", "u", "br", "p", "div", "span",
      "table", "thead", "tbody", "tr", "td", "th",
      "ul", "ol", "li", "img", "h1", "h2", "h3", "h4", "hr", "font",
    ],
    ALLOWED_ATTR: ["href", "src", "alt", "title", "style", "target", "rel", "width", "height", "colspan", "rowspan", "align", "color"],
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
  });
}
