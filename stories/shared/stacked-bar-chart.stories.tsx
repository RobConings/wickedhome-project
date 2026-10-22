import type { Meta, StoryObj } from "@storybook/react-vite";
import { StackedBarChart, type StackedBarDatum } from "@/components/shared/stacked-bar-chart";

const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const data: StackedBarDatum[] = days.map((day, index) => ({
  key: day,
  label: day,
  title: `${day} 14 September`,
  values: {
    grid: [4.1, 3.6, 5.2, 2.8, 3.9, 6.1, 5.4][index],
    own: [4.8, 5.3, 2.1, 6.0, 4.4, 3.2, 3.9][index],
    out: [9.2, 11.4, 3.0, 12.8, 8.1, 5.5, 7.7][index],
  },
}));

const labels = { showTable: "Show table", hideTable: "Hide table", category: "Day" };
const format = (value: number) => `${value.toLocaleString("nl-BE", { maximumFractionDigits: 1 })} kWh`;

const meta = {
  title: "Shared/StackedBarChart",
  component: StackedBarChart,
  decorators: [(Story) => <div className="w-[40rem] max-w-full rounded-xl border bg-card p-5">{Story()}</div>],
  args: {
    title: "Energy per day",
    series: [
      { key: "grid", label: "From the grid", color: "var(--chart-1)" },
      { key: "own", label: "Own production", color: "var(--chart-4)" },
      { key: "out", label: "Sent out", color: "var(--chart-2)", direction: "down" },
    ],
    data,
    formatValue: format,
    formatTick: (value: number) => value.toLocaleString("nl-BE"),
    axisLabel: "kWh",
    labels,
  },
} satisfies Meta<typeof StackedBarChart>;

export default meta;
type Story = StoryObj<typeof meta>;

export const UpAndDown: Story = {};

export const UpOnly: Story = {
  args: { series: [{ key: "grid", label: "From the grid", color: "var(--chart-1)" }, { key: "own", label: "Own production", color: "var(--chart-4)" }] },
};

export const SingleSeriesWithReference: Story = {
  args: {
    title: "Monthly peak",
    height: 140,
    series: [{ key: "peak", label: "Peak", color: "var(--chart-1)" }],
    data: ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"].map((label, index) => ({
      key: String(index),
      label,
      values: { peak: [4.6, 4.2, 3.9, 3.4, 2.9, 2.6, 2.3, 2.7, 3.1, 4.8, 5.2, null][index] },
    })),
    formatValue: (value: number) => `${value.toLocaleString("nl-BE")} kW`,
    axisLabel: "kW",
    referenceLine: { value: 2.5, label: "2,5 kW" },
  },
};

export const ManyBars: Story = {
  args: {
    data: Array.from({ length: 31 }, (_, index) => ({
      key: String(index),
      label: String(index + 1),
      values: { grid: 3 + Math.sin(index) * 1.5, own: 4 + Math.cos(index / 2) * 2, out: 7 + Math.sin(index / 3) * 4 },
    })),
  },
};

export const Empty: Story = { args: { data: [] } };

const months = ["Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr"];
/** In and out per month with a signed net line, a projected part (lighter, dashed) and a "now" marker. */
export const WithLineAndProjection: Story = {
  args: {
    title: "Money per month",
    series: [
      { key: "in", label: "In", color: "var(--chart-2)" },
      { key: "out", label: "Out", color: "var(--chart-1)", direction: "down" },
    ],
    data: months.map((label, index) => ({
      key: label,
      label,
      values: { in: 4200, out: index < 6 ? 4500 - index * 50 : 3300, net: 4200 - (index < 6 ? 4500 - index * 50 : 3300) },
    })),
    line: { key: "net", label: "Net", color: "var(--foreground)" },
    projectedFrom: "Nov",
    nowKey: "Oct",
    legendTotals: false,
    formatValue: (value: number) => `€ ${value.toLocaleString("nl-BE")}`,
    formatTick: (value: number) => value.toLocaleString("nl-BE"),
    axisLabel: "€",
    labels: { ...labels, category: "Month", projected: "projected", now: "Now" },
  },
};

/** Many columns on a narrow screen: the plot scrolls sideways and starts at "now". */
export const ScrollsOnPhones: Story = {
  ...WithLineAndProjection,
  decorators: [(Story) => <div className="w-[22rem] rounded-xl border bg-card p-4">{Story()}</div>],
  args: {
    ...WithLineAndProjection.args,
    minColumnWidth: 28,
    data: Array.from({ length: 36 }, (_, index) => ({
      key: String(index),
      label: String((index % 12) + 1),
      values: { in: 4200, out: index < 20 ? 4400 : 3100, net: 4200 - (index < 20 ? 4400 : 3100) },
    })),
    projectedFrom: "13",
    nowKey: "12",
  },
};
