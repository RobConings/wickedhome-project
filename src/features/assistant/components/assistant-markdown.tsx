import * as React from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { useTranslation } from "react-i18next";
import { RecordLink } from "@/components/shared/record-link";
import { Button } from "@/components/ui/button";
import { assistantHrefSchema } from "../types/response-components";

function CodeBlock({ children }: { children?: React.ReactNode }) {
  const { t } = useTranslation("assistant");
  const code = React.useRef<HTMLPreElement>(null);
  const [copied, setCopied] = React.useState(false);
  return <div className="my-3 min-w-0 overflow-hidden rounded-xl border bg-muted/50">
    <div className="flex justify-end border-b px-2"><Button size="sm" variant="ghost" onClick={() => { void navigator.clipboard.writeText(code.current?.textContent ?? "").then(() => setCopied(true)).catch(() => setCopied(false)); }}>{t(copied ? "chat.copied" : "chat.copyCode")}</Button></div>
    <pre ref={code} className="overflow-x-auto p-3 text-xs leading-relaxed">{children}</pre>
  </div>;
}
/** Raw HTML stays disabled. URLs pass an explicit scheme/path allowlist. */
export function AssistantMarkdown({ text, onRecordNavigate }: { text: string; onRecordNavigate?: () => void }) {
  return <div className="assistant-markdown w-full min-w-0 max-w-full break-words leading-7 [overflow-wrap:anywhere] [&_p]:my-2 [&_h1]:my-4 [&_h1]:text-xl [&_h1]:font-semibold [&_h2]:my-3 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:my-2 [&_h3]:font-semibold [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-1 [&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:border-primary [&_blockquote]:bg-muted/40 [&_blockquote]:px-4 [&_blockquote]:py-1 [&_a]:text-primary [&_a]:underline [&_code]:font-mono [&_table]:w-full [&_th]:border [&_th]:bg-muted/50 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_td]:border [&_td]:px-3 [&_td]:py-2 [&_hr]:my-4">
    <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[[rehypeHighlight, { detect: false }]]} skipHtml urlTransform={(url) => assistantHrefSchema.safeParse(url).success ? url : ""} components={{
      pre: CodeBlock,
      table: ({ children }) => <div className="my-3 max-w-full overflow-x-auto rounded-lg border"><table>{children}</table></div>,
      a: ({ href, children }) => !href ? <span>{children}</span> : href.startsWith("/") ? <RecordLink to={href} onClick={(event) => { if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) onRecordNavigate?.(); }}>{children}</RecordLink> : <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
      img: ({ src, alt }) => typeof src === "string" && src ? <a href={src} target="_blank" rel="noopener noreferrer"><img src={src} alt={alt ?? ""} loading="lazy" className="my-3 max-h-80 max-w-full rounded-xl object-contain" /></a> : null,
    }}>{text}</Markdown>
  </div>;
}
