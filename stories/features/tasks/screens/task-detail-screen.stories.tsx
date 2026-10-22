import type { Meta, StoryObj } from "@storybook/react-vite";
import { userEvent, within } from "storybook/test";
import { PackageIcon } from "lucide-react";
import { Card, CardDescription, CardTitle } from "@/components/shared/card";
import { DocumentAttachments } from "@/features/documents/components/document-attachments";
import { TaskDetailScreen } from "@/features/tasks/screens/task-detail-screen";
import { billAttachments, searchFilesFixture } from "../../documents/fixtures";
import { doneTaskDetailFixture, jacuzziDetailFixture, taskFixtures, taskHabitants, taskPlaces, vacuumDetailFixture } from "../fixtures";

/** Stand-in for Shopping's `TaskMaterialsPanel`, which the route puts in the `materials` slot. */
const materialsPlaceholder = (
  <Card>
    <CardTitle className="flex items-center gap-2">
      <PackageIcon className="size-4 text-muted-foreground" aria-hidden="true" />
      Materials (0/2 bought)
    </CardTitle>
    <ul className="flex flex-col gap-1 text-sm">
      <li>Insulation boards, 6 × · Gamma</li>
      <li>Nail gun · Gamma · gamma.be</li>
    </ul>
    <CardDescription>Rendered by the shopping feature in the app.</CardDescription>
  </Card>
);

const meta = {
  title: "Features/Tasks/Screens/TaskDetailScreen",
  component: TaskDetailScreen,
  parameters: { layout: "fullscreen" },
  args: { detail: jacuzziDetailFixture, habitants: taskHabitants, places: taskPlaces, canManage: true, currentHabitantId: "h1", materials: materialsPlaceholder },
} satisfies Meta<typeof TaskDetailScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WaitingForMaterials: Story = {};
export const RotatingWithHistory: Story = { args: { detail: vacuumDetailFixture, materials: undefined } };
/** Not a job: the materials panel moves to the bottom of the main column. */
export const MaintenanceWithMaterials: Story = {
  args: { detail: { ...jacuzziDetailFixture, task: taskFixtures.descale }, materials: materialsPlaceholder },
};
export const Done: Story = { args: { detail: doneTaskDetailFixture, materials: undefined } };
/** Lena's turn: she can mark it done and tick off steps, nothing else. */
export const AsChildOnDuty: Story = { args: { detail: vacuumDetailFixture, canManage: false, currentHabitantId: "h3", materials: undefined } };
/** The route puts the documents feature's `DocumentAttachments` in the `attachments` slot (a quote, instructions). */
export const WithDocuments: Story = {
  args: {
    attachments: (
      <DocumentAttachments
        entityType="task"
        entityId={jacuzziDetailFixture.task.id}
        canManage
        initialFiles={billAttachments.slice(1)}
        searchFiles={searchFilesFixture}
      />
    ),
  },
};

/** Skipping: only the Skip button is busy; the page stays readable. */
export const Skipping: Story = {
  args: { detail: vacuumDetailFixture, materials: undefined },
  parameters: { router: { action: async () => new Promise<never>(() => undefined) } },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Skip" }));
  },
};
