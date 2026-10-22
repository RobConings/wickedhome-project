import type { Meta, StoryObj } from "@storybook/react-vite";
import { BoxIcon, PlusIcon } from "lucide-react";
import { fn, userEvent, within } from "storybook/test";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/shared/card";
import { EmptyState } from "@/components/shared/empty-state";
import { GeneralList } from "@/components/shared/general-list";

type Thing = { id: string; name: string; category: "Kitchen" | "Living room" | "Garden"; note: string };

/** Domain-free example items; a few have accents to show accent-insensitive search ("cafe" finds "Café"). */
const things: Thing[] = [
  { id: "1", name: "Café table", category: "Living room", note: "Oak, seats four" },
  { id: "2", name: "Crème brûlée torch", category: "Kitchen", note: "Refill gas yearly" },
  { id: "3", name: "Reading lamp", category: "Living room", note: "Warm white bulb" },
  { id: "4", name: "Hose reel", category: "Garden", note: "25 m" },
  { id: "5", name: "Stand mixer", category: "Kitchen", note: "Dough hook in the drawer" },
  { id: "6", name: "Élan deck chair", category: "Garden", note: "Store inside in winter" },
  { id: "7", name: "Kettle", category: "Kitchen", note: "Descale monthly" },
];

const Row = ({ thing }: { thing: Thing }) => (
  <div className="flex items-center justify-between gap-3">
    <div className="flex min-w-0 flex-col">
      <span className="truncate font-medium">{thing.name}</span>
      <span className="truncate text-xs text-muted-foreground">{thing.note}</span>
    </div>
    <Badge variant="secondary">{thing.category}</Badge>
  </div>
);

const Tile = ({ thing }: { thing: Thing }) => (
  <Card className="gap-2 p-4">
    <CardTitle className="line-clamp-2">{thing.name}</CardTitle>
    <CardDescription className="line-clamp-2">{thing.note}</CardDescription>
    <Badge variant="secondary" className="mt-auto">
      {thing.category}
    </Badge>
  </Card>
);

const meta = {
  title: "Shared/GeneralList",
  component: GeneralList<Thing>,
  parameters: { layout: "padded" },
  args: {
    label: "Things",
    items: things,
    getKey: (thing) => thing.id,
    renderRow: (thing) => <Row thing={thing} />,
    renderTile: (thing) => <Tile thing={thing} />,
    search: { keys: ["name", "note", "category"] },
    defaultView: "list",
    emptyState: (
      <EmptyState
        icon={BoxIcon}
        title="Nothing here yet"
        description="Add the first thing to start the list."
        action={
          <Button>
            <PlusIcon />
            Add thing
          </Button>
        }
      />
    ),
  },
  decorators: [(Story) => <div className="mx-auto max-w-4xl"><Story /></div>],
} satisfies Meta<typeof GeneralList<Thing>>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ListView: Story = {};

export const TilesView: Story = { args: { defaultView: "tiles" } };

/** Search ignores case and accents: "creme" finds "Crème brûlée torch". */
export const SearchWithResults: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.type(within(canvasElement).getByRole("searchbox"), "creme");
  },
};

/** No match: a distinct state with the query and a button to clear the search. */
export const SearchWithoutResults: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.type(within(canvasElement).getByRole("searchbox"), "piano");
  },
};

export const Grouped: Story = {
  args: {
    groupBy: (thing) => thing.category,
    groupOrder: ["Kitchen", "Living room", "Garden"],
    renderGroupHeader: (key, list) => (
      <span className="flex items-center gap-2">
        {key}
        <span className="text-sm font-normal text-muted-foreground">{list.length}</span>
      </span>
    ),
  },
};

export const GroupedTwoColumns: Story = { args: { ...Grouped.args, groupColumns: 2 } };

/** With a toolbar row (filters) and an extra action next to the switcher. */
export const WithToolbar: Story = {
  args: {
    toolbar: (
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary">All</Button>
        <Button size="sm" variant="ghost">Kitchen</Button>
        <Button size="sm" variant="ghost">Garden</Button>
      </div>
    ),
  },
};

/** No items at all: only the empty state (search and switcher hide). */
export const Empty: Story = { args: { items: [] } };

/** A toolbar filter leaves nothing: "no results" instead of the empty state. */
export const FilteredToNothing: Story = { args: { items: [], filtered: true } };

export const Loading: Story = { args: { items: [], loading: true } };
export const LoadingTiles: Story = { args: { items: [], loading: true, defaultView: "tiles" } };

/** Newer items are loading: the current ones stay, faded, with a spinner. */
export const Refreshing: Story = { args: { pending: true } };

export const LoadFailed: Story ={ args: { items: [], error: true, onRetry: fn() } };

/** The screen keeps the query and view in the URL (`?q=` and `?view=`), e.g. for server-side search. */
export const FromUrl: Story = {
  args: { search: { keys: ["name"], param: "q" }, viewParam: "view" },
  parameters: { router: { initialEntries: ["/?q=lamp&view=tiles"] } },
};

/** The chosen view is remembered per list on this device (`storageKey`). */
export const RememberedView: Story = { args: { storageKey: "storybook-things" } };
