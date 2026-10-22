import type { Meta, StoryObj } from "@storybook/react-vite";
import { screen, userEvent, within } from "storybook/test";
import { Button } from "@/components/ui/button";
import { LinkToProjectDialog } from "@/features/projects/components/link-to-project-dialog";
import { projectCandidatesFixture } from "../fixtures";

const meta = {
  title: "Features/Projects/Components/LinkToProjectDialog",
  component: LinkToProjectDialog,
  args: { projectId: "pr-bathroom", kind: "expense", trigger: <Button>Add an existing expense</Button>, initialCandidates: projectCandidatesFixture },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button"));
    await screen.findByRole("dialog");
  },
} satisfies Meta<typeof LinkToProjectDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Expense: Story = {};
export const Task: Story = { args: { kind: "task", trigger: <Button>Add an existing task</Button> } };
export const Recurring: Story = { args: { kind: "recurring", trigger: <Button>Add a recurring expense</Button> } };
/** Candidates still loading (no API in Storybook: it then shows the error). */
export const Loading: Story = { args: { initialCandidates: undefined } };
