import { internalOrigin } from "@/lib/record-navigation";

export type MessageInline = { kind: "text"; text: string } | { kind: "strong"; text: string } | { kind: "link"; text: string; href: string; external: boolean };

/** Small, text-only Markdown subset. Model output never becomes HTML or an executable URL. */
export function messageInline(text: string): MessageInline[] {
  const parts: MessageInline[] = [];
  let position = 0;
  for (const match of text.matchAll(/\*\*([^*]+)\*\*|\[([^\]\n]+)\]\(([^)\s]+)\)/g)) {
    if (match.index > position) parts.push({ kind: "text", text: text.slice(position, match.index) });
    if (match[1]) parts.push({ kind: "strong", text: match[1] });
    else {
      const raw = match[3]!;
      const internal = internalOrigin(raw);
      let external: string | null = null;
      if (!raw.startsWith("/")) {
        try { const url = new URL(raw); if (["https:", "http:"].includes(url.protocol) && !url.username && !url.password) external = url.href; } catch { /* Keep incomplete/unsupported links as text while streaming. */ }
      }
      parts.push(internal || external ? { kind: "link", text: match[2]!, href: internal ?? external!, external: !internal } : { kind: "text", text: match[0] });
    }
    position = match.index + match[0].length;
  }
  if (position < text.length) parts.push({ kind: "text", text: text.slice(position) });
  return parts;
}
