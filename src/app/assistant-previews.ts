import * as React from "react";
import { registerAssistantPreviewRenderer } from "@/features/assistant";

/**
 * Feature renderers for the assistant's confirmation previews (ai/docs/ADDING-TOOLS.md, "describe and
 * preview"). Wired here, in the composition root, so the assistant never imports a feature. Each renderer is
 * lazy: its code loads the first time a card needs it, not with the chat.
 */

/** Floor-plan drawing changes: the floor before/after (ai/skills/floorplan). */
registerAssistantPreviewRenderer(
  "plan-diff",
  React.lazy(() => import("@/features/places").then((module) => ({ default: module.PlanDiffPreview }))),
);

/** A whole home project plan: project, ordered tasks, materials and budget (ai/skills/planner). */
registerAssistantPreviewRenderer(
  "project-plan",
  React.lazy(() => import("@/features/projects").then((module) => ({ default: module.ProjectPlanPreview }))),
);

/** A mail the assistant wrote: To, Subject, the message, attachments; editable on the card (ai/skills/mail). */
registerAssistantPreviewRenderer(
  "mail",
  React.lazy(() => import("@/features/integrations").then((module) => ({ default: module.MailComposePreview }))),
);
