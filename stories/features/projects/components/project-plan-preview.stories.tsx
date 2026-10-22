import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { ConfirmationCard } from "@/features/assistant/components/confirmation-card";
import { registerAssistantPreviewRenderer } from "@/features/assistant";
import ProjectPlanPreview from "@/features/projects/components/project-plan-preview";
import { PROJECT_PLAN_KIND, type ProjectPlanData } from "@/features/projects/types/project-plan";

// The confirmation card looks renderers up by kind; the app registers this one in src/app/assistant-previews.ts.
registerAssistantPreviewRenderer(PROJECT_PLAN_KIND, ProjectPlanPreview);

/** "We renoveren de badkamer: nieuwe tegels, douche, wc, aannemer Peeters" (fictional household and shops). */
const bathroomPlan: ProjectPlanData = {
  project: {
    name: "Badkamer renovatie",
    existing: false,
    budgetCents: 850_000,
    usedCents: 0,
    start: "2026-10-12",
    end: "2026-11-27",
    places: ["Badkamer"],
    contact: "Peeters Sanitair (aannemer)",
    notes: "Inloopdouche i.p.v. bad, hangtoilet, wandtegels tot het plafond. Peeters plaatst de douche en het toilet; tegelen doen we zelf.",
  },
  tasks: [
    { title: "Offerte vragen aan Peeters", place: null, who: ["Rob"], due: "2026-10-09", waitsFor: [], hours: 0.5, checklist: 3 },
    { title: "Tegels en sanitair kiezen", place: "Badkamer", who: ["Rob", "Sofie"], due: "2026-10-17", waitsFor: [], hours: 4, checklist: 0 },
    { title: "Badkamer leegmaken en oude tegels uitbreken", place: "Badkamer", who: ["Rob"], due: "2026-10-24", waitsFor: [2], hours: 12, checklist: 4 },
    { title: "Leidingen verleggen (Peeters)", place: "Badkamer", who: [], due: "2026-10-30", waitsFor: [1, 3], hours: null, checklist: 0 },
    { title: "Vloer egaliseren en waterdicht maken", place: "Badkamer", who: ["Rob"], due: "2026-11-04", waitsFor: [4], hours: 6, checklist: 2 },
    { title: "Wand- en vloertegels zetten", place: "Badkamer", who: ["Rob", "Sofie"], due: "2026-11-14", waitsFor: [5], hours: 24, checklist: 0 },
    { title: "Douche en hangtoilet plaatsen (Peeters)", place: "Badkamer", who: [], due: "2026-11-20", waitsFor: [6], hours: null, checklist: 0 },
    { title: "Voegen, kitten en schilderen", place: "Badkamer", who: ["Sofie"], due: "2026-11-24", waitsFor: [7], hours: 5, checklist: 3 },
    { title: "Opkuisen en spiegelkast ophangen", place: "Badkamer", who: ["Rob", "Sofie"], due: "2026-11-27", waitsFor: [8], hours: 3, checklist: 0 },
  ],
  materials: [
    { name: "Afvalcontainer 3 m³", quantity: 1, unit: null, task: 3, shop: null, url: null, priceCents: 24_000 },
    { name: "Stofmaskers FFP2", quantity: 10, unit: "st", task: 3, shop: "Bouwcenter Noord", url: null, priceCents: 150 },
    { name: "Egaline", quantity: 4, unit: "zak", task: 5, shop: "Bouwcenter Noord", url: null, priceCents: 1_890 },
    { name: "Afdichtingskit (vloeibaar)", quantity: 2, unit: "emmer", task: 5, shop: "Bouwcenter Noord", url: null, priceCents: 5_400 },
    { name: "Wandtegels 30 × 60 wit mat", quantity: 22, unit: "m²", task: 6, shop: "Tegelhuis De Smet", url: "https://www.example.com/tegels/wit-mat-30x60", priceCents: 3_495 },
    { name: "Vloertegels 60 × 60 antraciet", quantity: 6, unit: "m²", task: 6, shop: "Tegelhuis De Smet", url: null, priceCents: 4_200 },
    { name: "Tegellijm flexibel", quantity: 8, unit: "zak", task: 6, shop: "Bouwcenter Noord", url: null, priceCents: 1_750 },
    { name: "Tegelkruisjes 3 mm", quantity: 2, unit: "zak", task: 6, shop: "Bouwcenter Noord", url: null, priceCents: 450 },
    { name: "Inloopdouche glaswand 120 cm", quantity: 1, unit: null, task: 7, shop: null, url: null, priceCents: 64_900 },
    { name: "Hangtoilet met inbouwreservoir", quantity: 1, unit: null, task: 7, shop: null, url: null, priceCents: 52_000 },
    { name: "Thermostatische douchekraan", quantity: 1, unit: null, task: 7, shop: null, url: null, priceCents: null },
    { name: "Voegmortel grijs", quantity: 3, unit: "zak", task: 8, shop: "Bouwcenter Noord", url: null, priceCents: 1_290 },
    { name: "Sanitairkit wit", quantity: 3, unit: "tube", task: 8, shop: "Bouwcenter Noord", url: null, priceCents: 899 },
    { name: "Vochtwerende muurverf", quantity: 2.5, unit: "l", task: 8, shop: "Bouwcenter Noord", url: null, priceCents: 1_960 },
    { name: "Spiegelkast 80 cm", quantity: 1, unit: null, task: 9, shop: null, url: null, priceCents: 18_900 },
    { name: "Arbeid Peeters (offerte volgt)", quantity: 1, unit: null, task: null, shop: null, url: null, priceCents: null },
  ],
  warnings: [],
};

/** The same plan with a € 2.500 budget: the materials alone go over it. */
const overBudgetPlan: ProjectPlanData = {
  ...bathroomPlan,
  project: { ...bathroomPlan.project, budgetCents: 250_000 },
  warnings: ["“Opkuisen en spiegelkast ophangen” valt na de deadline."],
};

/** Adding a few tasks to a project that already has costs. */
const addToExisting: ProjectPlanData = {
  project: { name: "Tuin aanleggen", existing: true, budgetCents: 300_000, usedCents: 182_000, start: "2026-09-01", end: "2027-04-30", places: ["Tuin"], contact: null, notes: null },
  tasks: [
    { title: "Haag snoeien", place: "Tuin", who: ["Sofie"], due: "2026-10-18", waitsFor: [], hours: 3, checklist: 0 },
    { title: "Bloembollen planten", place: "Tuin", who: ["Lena", "Sofie"], due: "2026-10-25", waitsFor: [1], hours: 2, checklist: 0 },
  ],
  materials: [
    { name: "Tulpenbollen mix", quantity: 60, unit: "st", task: 2, shop: null, url: null, priceCents: 35 },
    { name: "Potgrond", quantity: 3, unit: "zak", task: 2, shop: null, url: null, priceCents: 799 },
  ],
  warnings: [],
};

const meta = {
  title: "Features/Projects/Components/ProjectPlanPreview",
  component: ProjectPlanPreview,
  args: { preview: { kind: PROJECT_PLAN_KIND, title: "Badkamer renovatie", data: bathroomPlan } },
  decorators: [
    (Story) => (
      <div className="w-[28rem] max-w-full rounded-lg border bg-muted/40 p-2.5">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ProjectPlanPreview>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A new bathroom project: 9 tasks in order with "waits for", 16 materials, in budget. */
export const Bathroom: Story = {};
/** On a phone: one column, names and meta lines wrap, prices stay on the right. */
export const Mobile: Story = { globals: { viewport: { value: "mobile1" } } };
/** The material estimate is above the budget: the total turns red; a date warning on top. */
export const OverBudget: Story = { args: { preview: { kind: PROJECT_PLAN_KIND, data: overBudgetPlan } } };
/** Over budget on a phone. */
export const OverBudgetMobile: Story = { args: { preview: { kind: PROJECT_PLAN_KIND, data: overBudgetPlan } }, globals: { viewport: { value: "mobile1" } } };
/** Adding to an existing project: what it already spent counts in the total. */
export const AddToExisting: Story = { args: { preview: { kind: PROJECT_PLAN_KIND, data: addToExisting } } };
/** Data that doesn't validate shows a short notice. */
export const InvalidData: Story = { args: { preview: { kind: PROJECT_PLAN_KIND, data: { tasks: "nope" } } } };

/** On the assistant's confirmation card: Apply = Confirm. */
export const OnConfirmationCard: StoryObj<typeof ConfirmationCard> = {
  render: (args) => <ConfirmationCard {...args} />,
  args: {
    summary: "Project Badkamer renovatie aanmaken met 9 taken en 16 materialen",
    permission: "write",
    allowRemember: false,
    onDecide: fn(),
    preview: { kind: PROJECT_PLAN_KIND, title: "Badkamer renovatie", data: bathroomPlan },
  },
};
