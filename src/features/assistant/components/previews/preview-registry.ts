import type * as React from "react";
import type { AssistantPreviewPayload } from "../preview-types";

/**
 * Renderers for confirmation previews, by `kind` (see `AssistantPreviewPayload`). Built in: `list` and
 * `fields`. A feature adds its own from its public index or the composition root, lazily when it is heavy:
 *
 *   registerAssistantPreviewRenderer("plan-diff", React.lazy(() => import("./plan-diff-preview")));
 *
 * The renderer gets the payload's `data` (validate it: it comes from the server) and, for tools with editable
 * arguments, `edit` (inputs while the person edits on the card).
 */
export type AssistantPreviewRendererProps = {
  preview: AssistantPreviewPayload;
  /**
   * Present when the tool lets the person change arguments on the card (`confirmation.editable`): while
   * `editing`, render inputs for the `editable` fields you know, show `values[field]` when set, and report
   * changes with `onChange`. The card sends them with Confirm; the server validates them again.
   */
  edit?: AssistantPreviewEdit;
};
export type AssistantPreviewEdit = {
  editing: boolean;
  editable: string[];
  values: Record<string, string>;
  onChange: (field: string, value: string) => void;
};
export type AssistantPreviewRenderer = React.ComponentType<AssistantPreviewRendererProps>;

const renderers = new Map<string, AssistantPreviewRenderer>();

export function registerAssistantPreviewRenderer(kind: string, renderer: AssistantPreviewRenderer): void {
  renderers.set(kind, renderer);
}

export const getAssistantPreviewRenderer = (kind: string): AssistantPreviewRenderer | undefined => renderers.get(kind);
