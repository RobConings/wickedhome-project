import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { BuildingIcon, MapPinIcon } from "lucide-react";
import { fn } from "storybook/test";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { EntityPicker, type EntityPickerItem } from "@/components/shared/entity-picker";

const places: EntityPickerItem[] = [
  { id: "kitchen", label: "Kitchen", description: "Ground floor", keywords: ["keuken"] },
  { id: "living", label: "Living room", description: "Ground floor", keywords: ["woonkamer"] },
  { id: "garage", label: "Garage", description: "Outside" },
  { id: "attic", label: "Attic", description: "Second floor", keywords: ["zolder"] },
  { id: "bathroom", label: "Bathroom", description: "First floor", keywords: ["badkamer"] },
  { id: "garden", label: "Garden", description: "Outside", keywords: ["tuin"] },
  { id: "basement", label: "Basement", description: "Below ground", keywords: ["kelder"] },
].map((item) => ({ ...item, leading: <MapPinIcon className="size-4 text-muted-foreground" /> }));

/** Stateful wrapper so stars and selection work in the story. */
function Interactive(props: React.ComponentProps<typeof EntityPicker>) {
  const [value, setValue] = React.useState(props.value ?? null);
  const [favoriteIds, setFavoriteIds] = React.useState(props.favoriteIds ?? []);
  return (
    <div className="w-80">
      <EntityPicker
        {...props}
        value={value}
        onChange={(id) => {
          setValue(id);
          return props.onChange?.(id);
        }}
        favoriteIds={favoriteIds}
        onToggleFavorite={(id) => {
          setFavoriteIds((ids) => (ids.includes(id) ? ids.filter((other) => other !== id) : [...ids, id]));
          props.onToggleFavorite?.(id);
        }}
      />
    </div>
  );
}

const meta = {
  title: "Shared/EntityPicker",
  component: EntityPicker,
  render: (args) => <Interactive {...args} />,
  args: {
    items: places,
    name: "placeId",
    placeholder: "Choose a place…",
    onChange: fn(),
    onToggleFavorite: fn(),
  },
} satisfies Meta<typeof EntityPicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithFavorites: Story = { args: { favoriteIds: ["kitchen", "garage"] } };

export const WithRecents: Story = { args: { recentIds: ["attic", "bathroom", "kitchen"] } };

export const FavoritesAndRecents: Story = {
  args: { favoriteIds: ["kitchen"], recentIds: ["attic", "kitchen", "garden"], value: "attic", clearable: true },
};

export const Empty: Story = { args: { items: [] } };

export const WithoutStars: Story = { args: { onToggleFavorite: undefined, recentIds: ["garage"] } };

export const ManyItems: Story = {
  args: {
    items: Array.from({ length: 250 }, (_, index) => ({
      id: `item-${index}`,
      label: `Building ${String(index + 1).padStart(3, "0")}`,
      description: index % 2 ? "Even street side" : "Odd street side",
      leading: <BuildingIcon className="size-4 text-muted-foreground" />,
    })),
    favoriteIds: ["item-4", "item-42"],
    recentIds: ["item-7", "item-199", "item-3"],
    placeholder: "Choose a building…",
  },
};

export const Invalid: Story = { args: { invalid: true } };

export const Disabled: Story = { args: { disabled: true, value: "garage" } };

/** The items haven't arrived yet: placeholder rows in the list, a spinner while the chosen item is unknown. */
export const Loading: Story = { args: { items: [], loading: true, value: "garage" } };

/** Items are there, favourites and recents are still loading. */
export const LoadingFavorites: Story = { args: { loading: true } };

/** Saving after a choice (e.g. a fetcher started by the parent). */
export const Busy: Story = { args: { busy: true, value: "kitchen" } };

/** `onChange` returns a promise: the trigger spins until it settles (here 1.5 s). */
export const SavesOnChange: Story = {
  args: { onChange: fn(() => new Promise((resolve) => setTimeout(resolve, 1500))) },
};

/** Regression case: the picker opens from a modal, has many destinations and must remain scrollable. */
export const GroupedDestinationsInsideDialog: Story = {
  render: () => {
    function Example() {
      const [value, setValue] = React.useState<string | null>(null);
      const items: EntityPickerItem[] = [
        { id: "group-colruyt", label: "Colruyt-groep", description: "Colruyt · OKay", featuredGroup: "Winkelgroepen" },
        { id: "group-diy", label: "Doe-het-zelf", description: "Gamma · Snuffelmarkt", featuredGroup: "Winkelgroepen" },
        ...Array.from({ length: 40 }, (_, index) => ({
          id: `shop-${index}`, label: `Winkel ${index + 1}`, description: "Afzonderlijke winkel",
        })),
      ];
      return <Dialog>
        <DialogTrigger asChild><Button>Start winkelen</Button></DialogTrigger>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-visible">
          <DialogHeader><DialogTitle>Een winkelbeurt starten</DialogTitle>
            <DialogDescription>Kies een winkel of opgeslagen groep.</DialogDescription></DialogHeader>
          <EntityPicker items={items} value={value} onChange={setValue} favoriteIds={["shop-0", "shop-1"]} placeholder="Kies een winkel of groep" />
        </DialogContent>
      </Dialog>;
    }
    return <Example />;
  },
};
