import * as React from "react";
import { MinusIcon, PencilIcon, PlusIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AssistantPreviewListItem, AssistantPreviewPayload } from "../preview-types";
import { getAssistantPreviewRenderer, registerAssistantPreviewRenderer, type AssistantPreviewEdit, type AssistantPreviewRendererProps } from "./preview-registry";

/** `list`: rows of what will be added, changed or removed (`{ items: { label, detail?, tone? }[] }`). */
function ListPreview({ preview }: AssistantPreviewRendererProps) {
  const items = (preview.data as { items?: AssistantPreviewListItem[] } | null)?.items;
  if (!Array.isArray(items) || !items.length) return null;
  const icons = { add: PlusIcon, change: PencilIcon, remove: MinusIcon } as const;
  return (
    <ul className="flex flex-col gap-1 text-sm">
      {items.slice(0, 50).map((item, index) => {
        const Icon = item.tone ? icons[item.tone] : null;
        return (
          <li key={index} className="flex min-w-0 items-start gap-2">
            {Icon && (
              <Icon
                aria-hidden
                className={cn("mt-0.5 size-4 shrink-0", item.tone === "add" && "text-success", item.tone === "remove" && "text-destructive", item.tone === "change" && "text-primary")}
              />
            )}
            <span className="min-w-0 break-words">
              <span className={cn(item.tone === "remove" && "line-through")}>{item.label}</span>
              {item.detail && <span className="text-muted-foreground"> · {item.detail}</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** `fields`: label / value pairs (`{ fields: { label, value }[] }`). */
function FieldsPreview({ preview }: AssistantPreviewRendererProps) {
  const fields = (preview.data as { fields?: { label: string; value: string }[] } | null)?.fields;
  if (!Array.isArray(fields) || !fields.length) return null;
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
      {fields.slice(0, 30).map((field, index) => (
        <React.Fragment key={index}>
          <dt className="text-muted-foreground">{field.label}</dt>
          <dd className="min-w-0 break-words">{field.value}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

registerAssistantPreviewRenderer("list", ListPreview);
registerAssistantPreviewRenderer("fields", FieldsPreview);

/** The preview of a confirmation card, by kind; nothing for kinds without a renderer. */
export function AssistantPreview({ preview, edit, className }: { preview: AssistantPreviewPayload; edit?: AssistantPreviewEdit; className?: string }) {
  // Registered components are module-level and stable; they are looked up, never created, here.
  const renderer = getAssistantPreviewRenderer(preview.kind);
  if (!renderer) return null;
  return (
    <div className={cn("flex flex-col gap-2 rounded-lg border bg-muted/40 p-2.5", className)}>
      {preview.title && <p className="text-xs font-medium text-muted-foreground">{preview.title}</p>}
      <React.Suspense fallback={<div className="h-16 animate-pulse rounded-md bg-muted" />}>
        {React.createElement(renderer, { preview, edit })}
      </React.Suspense>
    </div>
  );
}
