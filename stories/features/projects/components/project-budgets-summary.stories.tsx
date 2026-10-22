import type { Meta, StoryObj } from "@storybook/react-vite";
import { ProjectBudgetsCard } from "@/features/projects/components/project-budgets-card";
import { ProjectBudgetsSummary } from "@/features/projects/components/project-budgets-summary";
import { emptyProjectBudgetsSummaryFixture, projectBudgetsSummaryFixture } from "../fixtures";

const meta = {
  title: "Features/Projects/Components/ProjectBudgetsSummary",
  component: ProjectBudgetsSummary,
  args: { data: projectBudgetsSummaryFixture },
  decorators: [(Story) => <div className="max-w-md">{Story()}</div>],
} satisfies Meta<typeof ProjectBudgetsSummary>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Month: Story = {};
export const NothingRunning: Story = { args: { data: emptyProjectBudgetsSummaryFixture } };
/** Without data and without an API (Storybook): skeletons, then the error with Retry. */
export const LoadingOrError: Story = { args: { data: undefined } };

/** The card on the money flow page, with data from the route's loader. */
export const Card: Story = { render: () => <ProjectBudgetsCard data={projectBudgetsSummaryFixture} /> };
/** The deferred data still on its way. */
export const CardLoading: Story = { render: () => <ProjectBudgetsCard data={new Promise<never>(() => undefined)} /> };
/** The request failed: only this card says so. */
export const CardFailed: Story = { render: () => <ProjectBudgetsCard data={null} /> };
