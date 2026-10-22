import type { Meta, StoryObj } from "@storybook/react-vite";
import { HomeIcon, TreesIcon } from "lucide-react";
import { userEvent, within } from "storybook/test";
import { z } from "zod";
import { GeneralForm, type GeneralFormField, type GeneralFormSection } from "@/components/shared/general-form";
import { InlineAlert } from "@/components/shared/inline-alert";
import { SegmentedControl } from "@/components/shared/segmented-control";

const COLORS = ["#124734", "#3b82b6", "#7c5cc4", "#d4573b", "#d9912b"] as const;

/** The same schema the route action would use; the form validates with it before posting. */
const schema = z.object({
  name: z.string().trim().min(1).max(60),
  location: z.enum(["inside", "outside"]),
  notes: z.string().trim().max(500).optional(),
  quantity: z.coerce.number().int().min(1).optional(),
  price: z.coerce.number().int().min(0).optional(),
  boughtOn: z.iso.date().optional(),
  color: z.string(),
  heated: z.preprocess((value) => value === "on", z.boolean()),
  temperature: z.coerce.number().min(5).max(30).optional(),
  priority: z.enum(["low", "normal", "high"]).optional(),
});

const priorityField: GeneralFormField = {
  name: "priority",
  type: "custom",
  label: "Priority",
  description: "A custom field: the feature plugs in its own control (a picker, a segmented control…).",
  render: ({ name, value, setValue }) => (
    <SegmentedControl
      label="Priority"
      name={name}
      value={(value as string) || "normal"}
      onChange={setValue}
      options={[
        { value: "low", label: "Low" },
        { value: "normal", label: "Normal" },
        { value: "high", label: "High" },
      ]}
    />
  ),
};

const allFields: GeneralFormField[] = [
  { name: "name", type: "text", label: "Name", placeholder: "Living room heater", span: "half" },
  {
    name: "location",
    type: "select",
    label: "Location",
    span: "half",
    options: [
      { value: "inside", label: "Inside", icon: <HomeIcon /> },
      { value: "outside", label: "Outside", icon: <TreesIcon /> },
    ],
  },
  { name: "quantity", type: "number", label: "Quantity", inputMode: "numeric", min: 1, span: "half" },
  { name: "price", type: "money", label: "Price", span: "half" },
  { name: "boughtOn", type: "date", label: "Bought on", span: "half" },
  { name: "color", type: "color", label: "Colour", colors: COLORS },
  { name: "heated", type: "switch", label: "Heated", description: "Shows the temperature field when on." },
  {
    name: "temperature",
    type: "number",
    label: "Temperature (°C)",
    when: (values) => values.heated === true,
    min: 5,
    max: 30,
  },
  priorityField,
  { name: "notes", type: "textarea", label: "Notes", rows: 3 },
];

const sections: GeneralFormSection[] = [
  { title: "Basics", fields: allFields.slice(0, 2) },
  { title: "Purchase", description: "Optional details for warranty and insurance.", fields: allFields.slice(2, 5) },
  { title: "Settings", fields: allFields.slice(5) },
];

const meta = {
  title: "Shared/GeneralForm",
  component: GeneralForm,
  parameters: { layout: "padded" },
  args: {
    schema,
    fields: allFields,
    intent: "save",
    defaultValues: { location: "inside", color: COLORS[0] },
  },
  decorators: [(Story) => <div className="mx-auto max-w-xl"><Story /></div>],
} satisfies Meta<typeof GeneralForm>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Every field type, in a two-column grid from `sm` up (one column on phones). */
export const AllFieldTypes: Story = {};

export const WithSections: Story = { args: { fields: undefined, sections } };

/** "Heated" on shows the temperature field (`when`); off hides it and it isn't submitted. */
export const ConditionalField: Story = {
  args: { defaultValues: { location: "inside", color: COLORS[0], heated: true, temperature: 20 } },
};

/** The field config's `render` lets features plug in their own controls without shared knowing them. */
export const CustomFieldSlot: Story = { args: { fields: [allFields[0]!, priorityField] } };

/** Editing: values come from `defaultValues`, with a notice above the fields and a Cancel button. */
export const Editing: Story = {
  args: {
    intro: <InlineAlert tone="info">Changes apply to the whole household.</InlineAlert>,
    onCancel: () => undefined,
    defaultValues: {
      name: "Bathroom heater",
      location: "inside",
      quantity: 1,
      price: 4999,
      boughtOn: "2026-02-14",
      color: COLORS[3],
      heated: true,
      temperature: 22,
      priority: "high",
      notes: "Warranty until 2028.",
    },
  },
};

/** Browser validation with the schema: Save with an empty name. */
export const ClientErrors: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Save" }));
  },
};

/** The action answered with field errors and a form error (`FormResult`). */
export const ServerErrors: Story = {
  args: { defaultValues: { name: "Heater", location: "inside", color: COLORS[0] } },
  parameters: {
    router: {
      action: async () => ({
        errors: { name: ["A thing with this name already exists."], quantity: ["Must be at least 1."] },
        formError: "Not everything could be saved.",
      }),
    },
  },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Save" }));
  },
};

/** Saving: fields locked, Save spins until the action answers. */
export const Submitting: Story = {
  args: { defaultValues: { name: "Heater", location: "inside", color: COLORS[0] } },
  parameters: { router: { action: async () => new Promise<never>(() => undefined) } },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Save" }));
  },
};

const loginSchema = z.object({ email: z.email(), password: z.string().min(1) });

/**
 * Navigate mode (`navigate`): posts with a normal `<Form>` because the action redirects (login, setup,
 * invite links). Busy until the next page has loaded; errors come from `result` or the action data.
 */
export const NavigateMode: Story = {
  args: {
    navigate: true,
    schema: loginSchema,
    intent: undefined,
    defaultValues: {},
    fields: [
      { name: "email", type: "text", inputType: "email", inputMode: "email", autoComplete: "username", label: "Email" },
      { name: "password", type: "text", inputType: "password", autoComplete: "current-password", label: "Password" },
    ],
    submitLabel: "Log in",
    submittingLabel: "Logging in…",
    submitSize: "lg",
    result: { formError: "That email and password don't match." },
  },
};

/** Navigate mode while the action runs and the next page loads. */
export const NavigateBusy: Story = { args: { ...NavigateMode.args, result: undefined, busy: true } };
