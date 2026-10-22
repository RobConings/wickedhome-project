import type { Meta, StoryObj } from "@storybook/react-vite";
import { screen, userEvent, within } from "storybook/test";
import { Button } from "@/components/ui/button";
import { ProjectFormDialog } from "@/features/projects/components/project-form-dialog";
import { projectFixtures, projectPlacesFixture, projectsOverviewFixture } from "../fixtures";

const meta = {
  title: "Features/Projects/Components/ProjectFormDialog",
  component: ProjectFormDialog,
  args: {
    places: projectPlacesFixture,
    tags: projectsOverviewFixture.tags,
    trigger: <Button>New project</Button>,
  },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button"));
    await screen.findByRole("dialog");
  },
} satisfies Meta<typeof ProjectFormDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Create: Story = {};
export const Edit: Story = { args: { project: projectFixtures.bathroom, trigger: <Button>Edit</Button> } };
export const WithoutPlaces: Story = { args: { places: [] } };
/** Saving: the fields are locked and Save spins until the action answers. */
export const Saving: Story = {
  parameters: { router: { action: async () => new Promise<never>(() => undefined) } },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button"));
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByRole("textbox", { name: "Name" }), "Kitchen");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
  },
};
