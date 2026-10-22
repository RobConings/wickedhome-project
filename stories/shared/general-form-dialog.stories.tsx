import type { Meta, StoryObj } from "@storybook/react-vite";
import { Trash2Icon } from "lucide-react";
import { screen, userEvent, within } from "storybook/test";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import type { GeneralFormField } from "@/components/shared/general-form";
import { GeneralFormDialog } from "@/components/shared/general-form-dialog";

const COLORS = ["#124734", "#3b82b6", "#7c5cc4", "#d4573b"] as const;

const schema = z.object({
  name: z.string().trim().min(1).max(40),
  color: z.string(),
  notes: z.string().trim().max(200).optional(),
});

const fields: GeneralFormField[] = [
  { name: "name", type: "text", label: "Name" },
  { name: "color", type: "color", label: "Colour", colors: COLORS },
  { name: "notes", type: "textarea", label: "Notes", rows: 2 },
];

const meta = {
  title: "Shared/GeneralFormDialog",
  component: GeneralFormDialog,
  args: {
    trigger: <Button>Add label</Button>,
    title: "Add a label",
    description: "Labels group things across the app.",
    schema,
    fields,
    intent: "create",
    defaultValues: { color: COLORS[0] },
    successMessage: "Label added",
    /** Live preview with the current values. */
    media: (values) => (
      <span
        aria-hidden
        className="size-10 shrink-0 rounded-full border"
        style={{ backgroundColor: String(values.color ?? COLORS[0]) }}
      />
    ),
  },
} satisfies Meta<typeof GeneralFormDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Create: Story = {};

export const Edit: Story = {
  args: {
    trigger: <Button variant="outline">Edit “Garden”</Button>,
    title: "Edit label",
    intent: "update",
    hiddenFields: { id: "label-1" },
    defaultValues: { name: "Garden", color: COLORS[1], notes: "Outdoor things" },
  },
};

/**
 * Edit with a secondary footer action: "Delete" sits apart from Cancel/Save (left from `sm` up, at the bottom
 * on phones), asks first, posts its own intent and closes the dialog once it succeeded.
 */
export const WithDelete: Story = {
  args: {
    trigger: <Button variant="outline">Edit “Garden”</Button>,
    title: "Edit label",
    intent: "update",
    hiddenFields: { id: "label-1" },
    defaultValues: { name: "Garden", color: COLORS[1], notes: "Outdoor things" },
    secondaryAction: {
      label: "Delete",
      icon: <Trash2Icon />,
      destructive: true,
      intent: "delete",
      data: { id: "label-1" },
      confirm: { title: "Delete “Garden”?", description: "Things keep existing; they just lose this label." },
      successMessage: "Label deleted",
    },
  },
  parameters: { router: { action: async () => new Promise((resolve) => setTimeout(() => resolve({ ok: true }), 800)) } },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Edit “Garden”" }));
    await userEvent.click(await screen.findByRole("button", { name: "Delete" }));
  },
};

/** The server answered with a field error; the dialog stays open and shows it. */
export const ServerErrors: Story = {
  parameters: { router: { action: async () => ({ errors: { name: ["This name is already used."] } }) } },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Add label" }));
    await userEvent.type(await screen.findByLabelText("Name"), "Garden");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
  },
};

/** Saving: fields locked, Save spins, and the dialog can't be closed until the save is done. */
export const Saving: Story = {
  parameters: { router: { action: async () => new Promise<never>(() => undefined) } },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Add label" }));
    await userEvent.type(await screen.findByLabelText("Name"), "Garden");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
  },
};
