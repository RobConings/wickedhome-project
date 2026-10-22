import type { Meta, StoryObj } from "@storybook/react-vite";
import { TasksScreen } from "@/features/tasks/screens/tasks-screen";
import {
  allDoneOverviewFixture,
  allDoneTodayOverviewFixture,
  emptyTasksOverviewFixture,
  taskHabitants,
  taskPlaces,
  tasksOverviewFixture,
} from "../fixtures";

const meta = {
  title: "Features/Tasks/Screens/TasksScreen",
  component: TasksScreen,
  parameters: { layout: "fullscreen" },
  args: { overview: tasksOverviewFixture, habitants: taskHabitants, places: taskPlaces, canManage: true, currentHabitantId: "h1" },
} satisfies Meta<typeof TasksScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The default: everything open from every source by day, today's progress, done-today items struck through. */
export const AllOpen: Story = {};
export const Mine: Story = { parameters: { router: { initialEntries: ["/tasks?view=mine"] } } };
/** Nothing left for today: "All done for today", with what's left for later below. */
export const AllDoneToday: Story = { args: { overview: allDoneTodayOverviewFixture } };
/** Nothing open at all. */
export const AllDone: Story = { args: { overview: allDoneOverviewFixture } };
export const AllByPlace: Story = { parameters: { router: { initialEntries: ["/tasks?view=all&group=place"] } } };
export const OutsideOnly: Story = { parameters: { router: { initialEntries: ["/tasks?view=all&location=outside"] } } };
export const ReadyToStart: Story = { parameters: { router: { initialEntries: ["/tasks?view=ready"] } } };
export const Overdue: Story = { parameters: { router: { initialEntries: ["/tasks?view=overdue"] } } };
export const ByType: Story = { parameters: { router: { initialEntries: ["/tasks?view=all&group=type"] } } };
export const JobsOnly: Story = { parameters: { router: { initialEntries: ["/tasks?view=all&type=job"] } } };
export const PerPerson: Story = { parameters: { router: { initialEntries: ["/tasks?view=all&group=assignee"] } } };
export const Done: Story = { parameters: { router: { initialEntries: ["/tasks?view=done"] } } };
export const LenaAsChild: Story = { args: { canManage: false, currentHabitantId: "h3" } };
export const NewFromPlace: Story = { parameters: { router: { initialEntries: ["/tasks?new=1&place=p-jacuzzi"] } } };
/** From the dashboard's quick action (`?new=1`): the form opens; the param is removed so back/refresh doesn't reopen it. */
export const NewFromDashboard: Story = { parameters: { router: { initialEntries: ["/tasks?new=1"] } } };
export const NoMatches: Story = { parameters: { router: { initialEntries: ["/tasks?view=all&assignee=h4"] } } };
export const Empty: Story = { args: { overview: emptyTasksOverviewFixture } };
export const Mobile: Story = { globals: { viewport: { value: "mobile1" } } };
