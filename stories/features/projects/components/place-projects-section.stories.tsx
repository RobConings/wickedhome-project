import type { Meta, StoryObj } from "@storybook/react-vite";
import { PlaceProjectsSection } from "@/features/projects/components/place-projects-section";
import { projectListFixture } from "../fixtures";
const meta = { title: "Features/Projects/Components/PlaceProjectsSection", component: PlaceProjectsSection, parameters: { layout: "padded" }, args: { placeId: projectListFixture[0]!.places[0]?.id ?? "room", initialProjects: projectListFixture } } satisfies Meta<typeof PlaceProjectsSection>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Phone: Story = { globals: { viewport: { value: "mobile1", isRotated: false } } };

